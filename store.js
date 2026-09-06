// ── Data store ────────────────────────────────────────────────────────────────
// Runs entirely on GitHub Pages. No backend, no third-party service.
//
// Reading is the same for everyone and needs no setup: the app always starts
// from the published database.json, so a name committed by one person shows up
// for everybody else on their next load or refresh.
//
// Writing is what differs. With a GitHub token configured, an addition is
// committed to database.json and becomes everyone's. Without one, it is kept
// as a "local extra" — layered on top of the published list on this device so
// the person can use it immediately, but invisible to everyone else until
// somebody with a token commits it.

const STORE_KEYS = {
    data:   'hcmg.database',
    extras: 'hcmg.localExtras',
    sync:   'hcmg.sync',
    stamp:  'hcmg.database.savedAt'
};

const CATEGORIES = ['boats', 'locations', 'crew', 'divers'];

const Store = {
    data:   { boats: [], locations: [], crew: [], divers: [] },  // what the UI shows
    remote: { boats: [], locations: [], crew: [], divers: [] },  // what everyone shares
    sha: null,          // blob sha of database.json, needed to write it back
    source: 'none',     // 'github' | 'published' | 'cache'
    lastLoadedAt: null,

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

    // Entries this device added that are not in the shared list yet.
    get localOnly() {
        const extras = this.readExtras();
        return CATEGORIES.reduce((n, key) => n + extras[key].length, 0);
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
    // Always tries the shared copy first so the lists stay current for everyone.
    // The cached copy is a fallback for being offline, never the primary source
    // — otherwise one local addition would freeze this device on a stale list.
    async load() {
        try {
            if (this.syncEnabled) {
                const remote = await this.fetchFromGitHub();
                this.remote = normalize(remote.data);
                this.sha = remote.sha;
                this.source = 'github';
            } else {
                this.remote = await this.fetchPublished();
                this.source = 'published';
            }
            // Local extras ride on top until someone commits them.
            this.data = mergeData(this.remote, this.readExtras());
            this.lastLoadedAt = new Date();
            this.cacheLocally();
            return this.data;
        } catch (err) {
            console.warn('Could not reach the shared list, using cache:', err);
        }

        const cached = this.readLocalCache();
        if (cached) {
            this.data = cached;
            this.source = 'cache';
            return this.data;
        }
        throw new Error('Could not load the crew and diver lists, and nothing is cached yet');
    },

    // The copy GitHub Pages serves. Readable by anyone, no token, no rate limit.
    async fetchPublished() {
        const res = await fetch(`database.json?ts=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Could not read database.json (HTTP ${res.status})`);
        return normalize(await res.json());
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

    readExtras() {
        try {
            const raw = localStorage.getItem(STORE_KEYS.extras);
            return raw ? normalize(JSON.parse(raw)) : normalize({});
        } catch { return normalize({}); }
    },

    writeExtras(extras) {
        try {
            const empty = CATEGORIES.every(k => extras[k].length === 0);
            if (empty) localStorage.removeItem(STORE_KEYS.extras);
            else localStorage.setItem(STORE_KEYS.extras, JSON.stringify(extras));
        } catch (err) {
            console.warn('Could not record local additions:', err);
        }
    },

    // ── Mutating ──────────────────────────────────────────────────────────────
    // Returns { synced } so the caller can say whether the change left this device.
    async add(category, value) {
        if (!CATEGORIES.includes(category)) throw new Error(`Unknown category "${category}"`);
        const trimmed = String(value).trim();
        if (!trimmed) throw new Error('Value cannot be empty');
        if (this.data[category].some(v => v.toLowerCase() === trimmed.toLowerCase())) {
            throw new Error(`"${trimmed}" already exists`);
        }

        this.data[category] = [...this.data[category], trimmed].sort(collate);
        if (!this.syncEnabled) {
            const extras = this.readExtras();
            extras[category] = [...new Set([...extras[category], trimmed])].sort(collate);
            this.writeExtras(extras);
        }
        return this.persist(`Add ${trimmed} to ${category}`);
    },

    async remove(category, value) {
        if (!CATEGORIES.includes(category)) throw new Error(`Unknown category "${category}"`);
        this.data[category] = this.data[category].filter(v => v !== value);
        if (!this.syncEnabled) {
            const extras = this.readExtras();
            extras[category] = extras[category].filter(v => v !== value);
            this.writeExtras(extras);
        }
        return this.persist(`Remove ${value} from ${category}`);
    },

    async replaceAll(next, message = 'Edit database') {
        this.data = normalize(next);
        if (!this.syncEnabled) this.writeExtras(subtract(this.data, this.remote));
        return this.persist(message);
    },

    // Anything the editor removed that is in the shared list will come back on
    // the next load, because the shared copy is the base. Let the UI say so.
    pendingRemovals() {
        if (this.syncEnabled) return [];
        return CATEGORIES.flatMap(key =>
            this.remote[key].filter(v => !this.data[key].includes(v))
        );
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

        // Everything is in the shared copy now, so nothing is local-only.
        this.remote = normalize(this.data);
        this.writeExtras(normalize({}));
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
function mergeData(base, overlay) {
    const out = {};
    CATEGORIES.forEach(key => {
        out[key] = [...new Set([...(base[key] || []), ...(overlay[key] || [])])].sort(collate);
    });
    return out;
}

// Entries present in a but not in b.
function subtract(a, b) {
    const out = {};
    CATEGORIES.forEach(key => {
        const seen = new Set(b[key] || []);
        out[key] = (a[key] || []).filter(v => !seen.has(v));
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
