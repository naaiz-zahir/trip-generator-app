// ── Data store ────────────────────────────────────────────────────────────────
// Runs entirely on GitHub Pages. No backend, no third-party service.
//
// Three layers, in priority order:
//   1. GitHub sync   — optional. Reads/writes database.json in this repo through
//                      the GitHub REST API using a token the user pastes into
//                      Settings. Shared across everyone who configures it.
//   2. localStorage  — always on. Survives reloads, private to the device.
//   3. database.json — the copy committed to the repo, served by Pages. Used as
//                      the seed on a fresh device and as an offline fallback.

const STORE_KEYS = {
    data:  'hcmg.database',
    sync:  'hcmg.sync',
    stamp: 'hcmg.database.savedAt'
};

const CATEGORIES = ['boats', 'locations', 'crew', 'divers'];

const Store = {
    data: { boats: [], locations: [], crew: [], divers: [] },
    sha: null,          // blob sha of database.json, needed to write it back
    source: 'none',     // where the loaded data came from

    // ── Sync configuration ────────────────────────────────────────────────────
    getSyncConfig() {
        try {
            const raw = localStorage.getItem(STORE_KEYS.sync);
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    },

    setSyncConfig(cfg) {
        if (cfg) localStorage.setItem(STORE_KEYS.sync, JSON.stringify(cfg));
        else localStorage.removeItem(STORE_KEYS.sync);
    },

    get syncEnabled() {
        const cfg = this.getSyncConfig();
        return !!(cfg && cfg.token && cfg.repo);
    },

    // Guess owner/repo from the Pages URL so Settings can pre-fill it.
    guessRepo() {
        const host = location.hostname;              // naaiz-zahir.github.io
        const path = location.pathname.split('/').filter(Boolean);
        if (host.endsWith('.github.io')) {
            const owner = host.replace('.github.io', '');
            const repo  = path.length ? path[0] : `${owner}.github.io`;
            return `${owner}/${repo}`;
        }
        return '';
    },

    // ── Loading ───────────────────────────────────────────────────────────────
    async load() {
        if (this.syncEnabled) {
            try {
                const remote = await this.fetchFromGitHub();
                this.data = normalize(remote.data);
                this.sha = remote.sha;
                this.source = 'github';
                this.cacheLocally();
                return this.data;
            } catch (err) {
                console.warn('GitHub sync read failed, falling back:', err);
            }
        }

        const cached = this.readLocalCache();
        if (cached) {
            this.data = cached;
            this.source = 'local';
            // Refresh the sha in the background so a later save can succeed.
            if (this.syncEnabled) this.refreshSha();
            return this.data;
        }

        // Fresh device with no sync: seed from the committed file.
        const res = await fetch(`database.json?ts=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Could not read database.json (HTTP ${res.status})`);
        this.data = normalize(await res.json());
        this.source = 'repo';
        this.cacheLocally();
        return this.data;
    },

    readLocalCache() {
        try {
            const raw = localStorage.getItem(STORE_KEYS.data);
            return raw ? normalize(JSON.parse(raw)) : null;
        } catch { return null; }
    },

    cacheLocally() {
        try {
            localStorage.setItem(STORE_KEYS.data, JSON.stringify(this.data));
            localStorage.setItem(STORE_KEYS.stamp, new Date().toISOString());
        } catch (err) {
            console.warn('Could not cache database locally:', err);
        }
    },

    // ── Mutating ──────────────────────────────────────────────────────────────
    // Adds a value and persists. Returns { synced: bool } so the caller can tell
    // the user whether the change left this device.
    async add(category, value) {
        if (!CATEGORIES.includes(category)) throw new Error(`Unknown category "${category}"`);
        const trimmed = String(value).trim();
        if (!trimmed) throw new Error('Value cannot be empty');
        if (this.data[category].some(v => v.toLowerCase() === trimmed.toLowerCase())) {
            throw new Error(`"${trimmed}" already exists`);
        }
        this.data[category] = [...this.data[category], trimmed].sort(collate);
        return this.persist(`Add ${trimmed} to ${category}`);
    },

    async remove(category, value) {
        if (!CATEGORIES.includes(category)) throw new Error(`Unknown category "${category}"`);
        this.data[category] = this.data[category].filter(v => v !== value);
        return this.persist(`Remove ${value} from ${category}`);
    },

    async replaceAll(next, message = 'Edit database') {
        this.data = normalize(next);
        return this.persist(message);
    },

    async persist(message) {
        this.cacheLocally();
        if (!this.syncEnabled) return { synced: false };
        await this.pushToGitHub(message);
        return { synced: true };
    },

    // ── GitHub REST calls ─────────────────────────────────────────────────────
    apiUrl(cfg) {
        const branch = cfg.branch || 'main';
        return `https://api.github.com/repos/${cfg.repo}/contents/${encodeURIComponent(cfg.path || 'database.json')}?ref=${encodeURIComponent(branch)}`;
    },

    headers(cfg) {
        return {
            'Authorization': `Bearer ${cfg.token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        };
    },

    async fetchFromGitHub() {
        const cfg = this.getSyncConfig();
        const res = await fetch(this.apiUrl(cfg), { headers: this.headers(cfg), cache: 'no-store' });
        if (!res.ok) throw new Error(await describeError(res));
        const json = await res.json();
        return { data: JSON.parse(decodeBase64(json.content)), sha: json.sha };
    },

    async refreshSha() {
        try {
            const remote = await this.fetchFromGitHub();
            this.sha = remote.sha;
        } catch (err) {
            console.warn('Could not refresh file sha:', err);
        }
    },

    async pushToGitHub(message, isRetry = false) {
        const cfg = this.getSyncConfig();
        const branch = cfg.branch || 'main';
        const body = {
            message: `${message} [via HCMG]`,
            content: encodeBase64(JSON.stringify(this.data, null, 2) + '\n'),
            branch
        };
        if (this.sha) body.sha = this.sha;

        const res = await fetch(this.apiUrl(cfg).split('?')[0], {
            method: 'PUT',
            headers: { ...this.headers(cfg), 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        // 409/422 means someone else committed since we last read. Merge and retry once.
        if ((res.status === 409 || res.status === 422) && !isRetry) {
            const remote = await this.fetchFromGitHub();
            this.data = mergeData(remote.data, this.data);
            this.sha = remote.sha;
            this.cacheLocally();
            return this.pushToGitHub(message, true);
        }

        if (!res.ok) throw new Error(await describeError(res));
        const json = await res.json();
        this.sha = json.content.sha;
        return json;
    },

    // Verify a token/repo pair before saving it.
    async testSync(cfg) {
        const res = await fetch(this.apiUrl(cfg), { headers: this.headers(cfg), cache: 'no-store' });
        if (!res.ok) throw new Error(await describeError(res));
        const json = await res.json();
        JSON.parse(decodeBase64(json.content)); // fail loudly on malformed JSON
        return true;
    }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Sorts numerically-prefixed entries ("7479 SGT ...") in true numeric order.
function collate(a, b) {
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function normalize(raw) {
    const out = {};
    CATEGORIES.forEach(key => {
        const list = Array.isArray(raw && raw[key]) ? raw[key] : [];
        out[key] = [...new Set(list.map(v => String(v).trim()).filter(Boolean))].sort(collate);
    });
    return out;
}

// Union of both sides, so a concurrent edit elsewhere is never dropped.
function mergeData(remote, local) {
    const out = {};
    CATEGORIES.forEach(key => {
        out[key] = [...new Set([...(remote[key] || []), ...(local[key] || [])])].sort(collate);
    });
    return out;
}

// btoa/atob are byte-oriented; names carry non-ASCII (Malé, em dashes).
function encodeBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary);
}

function decodeBase64(b64) {
    const binary = atob(String(b64).replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

async function describeError(res) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch { /* no body */ }
    if (res.status === 401) return 'Token rejected (401) — check it has not expired';
    if (res.status === 403) return `Access denied (403) — token needs Contents: Read and write${detail ? ` — ${detail}` : ''}`;
    if (res.status === 404) return 'Not found (404) — check the owner/repo, branch and file path';
    return `GitHub API error ${res.status}${detail ? `: ${detail}` : ''}`;
}
