// ── Data store ────────────────────────────────────────────────────────────────
// The shared lists live in a Firebase Realtime Database. Everyone reads and
// writes them without any per-person setup: the Firebase web config is public
// by design, and what constrains access is the security rules on the database
// (see README). Additions push to every other open device within a second.
//
// If Firebase is not configured yet, or is unreachable, the app falls back to
// the copy of database.json committed in this repository. That keeps it usable
// read-only, with additions held on the device until Firebase comes back.

const STORE_KEYS = {
    data:   'hcmg.database',
    extras: 'hcmg.localExtras',
    stamp:  'hcmg.database.savedAt'
};

const CATEGORIES = ['boats', 'locations', 'crew', 'divers'];

// The Firebase console hands you a snippet declaring `firebaseConfig`, so accept
// that name as well as our own rather than failing silently on a verbatim paste.
const FIREBASE_SETTINGS = (() => {
    if (typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG) return FIREBASE_CONFIG;
    if (typeof firebaseConfig !== 'undefined' && firebaseConfig) return firebaseConfig;
    return {};
})();

// ── Firebase backend ──────────────────────────────────────────────────────────
const FirebaseBackend = {
    db: null,
    ready: false,

    // Treated as unconfigured until a databaseURL is filled in.
    get configured() {
        return !!FIREBASE_SETTINGS.databaseURL && !!FIREBASE_SETTINGS.apiKey;
    },

    get available() {
        return this.configured && typeof firebase !== 'undefined';
    },

    // Signs in anonymously so the rules can require auth without asking anyone
    // to log in. The account is per-device and carries no personal data.
    async connect() {
        if (this.ready) return;
        if (!this.available) throw new Error('Firebase is not configured');

        firebase.initializeApp(FIREBASE_SETTINGS);
        await firebase.auth().signInAnonymously();
        this.db = firebase.database();
        this.ready = true;
    },

    // Calls back with the full list on connect and on every later change.
    subscribe(handler, onError) {
        this.db.ref('lists').on('value',
            snap => handler(fromSnapshot(snap.val())),
            err  => onError && onError(err));
    },

    // Entries are stored as { pushKey: "value" } rather than as arrays, so two
    // people adding at the same moment cannot overwrite each other.
    async add(category, value) {
        await this.db.ref(`lists/${category}`).push(value);
    },

    // Copies database.json into the database when it is empty. The claim is a
    // transaction so several devices opening at once cannot each seed it, and
    // it expires: without that, a seeder which died mid-write — or a database
    // someone emptied by hand — would stay empty forever with the claim held.
    async seedIfEmpty(seed) {
        const STALE_AFTER = 60000;
        const claim = await this.db.ref('meta/seeded').transaction(current => {
            const fresh = current && current.at && (Date.now() - current.at) < STALE_AFTER;
            return fresh ? undefined : { at: Date.now() };
        });
        if (!claim.committed) return false;

        const payload = {};
        CATEGORIES.forEach(key => {
            payload[key] = {};
            seed[key].forEach(value => {
                payload[key][this.db.ref().push().key] = value;
            });
        });
        await this.db.ref('lists').set(payload);
        return true;
    }
};

// ── Store ─────────────────────────────────────────────────────────────────────
const Store = {
    data:   { boats: [], locations: [], crew: [], divers: [] },
    shared: { boats: [], locations: [], crew: [], divers: [] },
    source: 'none',       // 'firebase' | 'published' | 'cache'
    onChange: null,       // set by the UI to react to a live update

    get live() { return this.source === 'firebase'; },

    // Entries added on this device that the shared list does not have.
    get localOnly() {
        const extras = this.readExtras();
        return CATEGORIES.reduce((n, key) => n + extras[key].length, 0);
    },

    async load() {
        if (FirebaseBackend.available) {
            try {
                await FirebaseBackend.connect();
                await this.firstSnapshot();
                this.source = 'firebase';
                await this.flushExtras();
                return this.data;
            } catch (err) {
                console.warn('Firebase unavailable, falling back to the committed list:', err);
            }
        }

        try {
            this.shared = await this.fetchPublished();
            this.source = 'published';
            this.data = mergeData(this.shared, this.readExtras());
            this.cacheLocally();
            return this.data;
        } catch (err) {
            console.warn('Could not read the published list:', err);
        }

        const cached = this.readLocalCache();
        if (cached) {
            this.data = cached;
            this.source = 'cache';
            return this.data;
        }
        throw new Error('Could not load the crew and diver lists, and nothing is cached yet');
    },

    // Resolves on the first value from Firebase; later values arrive on their
    // own and are handed to the UI through onChange.
    firstSnapshot() {
        return new Promise((resolve, reject) => {
            let settled = false;
            // Armed until something actually settles. Clearing it on the first
            // snapshot instead would strand us with no fallback whenever that
            // snapshot is empty and the seed does not complete.
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error('Firebase did not return a usable list in time'));
            }, 8000);
            const settle = fn => { if (settled) return; settled = true; clearTimeout(timer); fn(); };

            FirebaseBackend.subscribe(async lists => {
                const empty = CATEGORIES.every(key => lists[key].length === 0);
                if (empty && !settled) {
                    // Nothing there yet — populate it from the committed file.
                    // Whether this device wins the claim or another one is
                    // already seeding, the filled-in snapshot arrives on its
                    // own. Returning here matters: falling through would
                    // publish the empty list and blank everyone's roster.
                    try {
                        const seed = await this.fetchPublished();
                        await FirebaseBackend.seedIfEmpty(seed);
                        return;
                    } catch (err) {
                        // Never fall through to publishing the empty snapshot:
                        // let the timeout below drop us to the committed list.
                        console.warn('Could not seed the database:', err);
                        return;
                    }
                }

                this.shared = lists;
                this.data = lists;
                this.cacheLocally();

                if (!settled) settle(() => resolve(this.data));
                else if (this.onChange) this.onChange(this.data);
            }, err => settle(() => reject(err)));
        });
    },

    // Anything added while offline or before Firebase was set up gets pushed
    // up the first time a connection is available, then stops being local.
    async flushExtras() {
        const extras = this.readExtras();
        const pending = CATEGORIES.flatMap(key =>
            extras[key].filter(v => !this.shared[key].includes(v)).map(v => [key, v]));
        if (!pending.length) { this.writeExtras(normalize({})); return; }

        for (const [category, value] of pending) {
            try { await FirebaseBackend.add(category, value); }
            catch (err) { console.warn(`Could not upload "${value}":`, err); return; }
        }
        this.writeExtras(normalize({}));
    },

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
            console.warn('Could not cache the list locally:', err);
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
            if (CATEGORIES.every(k => extras[k].length === 0)) localStorage.removeItem(STORE_KEYS.extras);
            else localStorage.setItem(STORE_KEYS.extras, JSON.stringify(extras));
        } catch (err) {
            console.warn('Could not record local additions:', err);
        }
    },

    // ── Mutating ──────────────────────────────────────────────────────────────
    // Returns { shared } so the caller can say whether the change reached
    // everyone or is still sitting on this device.
    async add(category, value) {
        if (!CATEGORIES.includes(category)) throw new Error(`Unknown category "${category}"`);
        const trimmed = String(value).trim();
        if (!trimmed) throw new Error('Value cannot be empty');
        if (this.data[category].some(v => v.toLowerCase() === trimmed.toLowerCase())) {
            throw new Error(`"${trimmed}" already exists`);
        }

        if (this.live) {
            await FirebaseBackend.add(category, trimmed);
            // The subscription echoes the new value back and refreshes the UI,
            // but update locally too so the change shows without waiting.
            this.data[category] = [...this.data[category], trimmed].sort(collate);
            return { shared: true };
        }

        this.data[category] = [...this.data[category], trimmed].sort(collate);
        const extras = this.readExtras();
        extras[category] = [...new Set([...extras[category], trimmed])].sort(collate);
        this.writeExtras(extras);
        this.cacheLocally();
        return { shared: false };
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

// Firebase stores { pushKey: value } maps; flatten them back to sorted lists.
function fromSnapshot(value) {
    const raw = {};
    CATEGORIES.forEach(key => {
        const node = (value && value[key]) || {};
        raw[key] = Object.values(node);
    });
    return normalize(raw);
}

function mergeData(base, overlay) {
    const out = {};
    CATEGORIES.forEach(key => {
        out[key] = [...new Set([...(base[key] || []), ...(overlay[key] || [])])].sort(collate);
    });
    return out;
}

