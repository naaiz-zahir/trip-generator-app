// ── Data panel ────────────────────────────────────────────────────────────────
// Nobody needs this to use the app: adding people works from the main screen and
// reaches everyone. The panel is here for occasional housekeeping — checking the
// connection, correcting an entry, and taking a backup.

function updateSyncBadge() {
    const badge = document.getElementById('syncBadge');
    if (!badge) return;

    const pending = Store.localOnly;

    if (Store.live) {
        badge.textContent = '● Live';
        badge.className = 'sync-badge sync-on';
        badge.title = 'Everyone sees the same list. Changes appear on other devices straight away.';
    } else if (Store.source === 'cache') {
        badge.textContent = '○ Offline';
        badge.className = 'sync-badge sync-off';
        badge.title = 'Showing the last list saved on this device. It may be out of date.';
    } else if (pending > 0) {
        badge.textContent = `● ${pending} not shared`;
        badge.className = 'sync-badge sync-pending';
        badge.title = `${pending} ${pending === 1 ? 'entry is' : 'entries are'} on this device only, ` +
                      'and will upload once the shared list is reachable.';
    } else {
        badge.textContent = '● Read only';
        badge.className = 'sync-badge sync-read';
        badge.title = 'Showing the list committed in the repository. ' +
                      'Firebase is not configured, so additions stay on this device.';
    }
}

function openSettings() {
    document.getElementById('dataEditor').value = JSON.stringify(Store.data, null, 2);
    document.getElementById('settingsStatus').textContent = '';
    describeConnection();
    document.getElementById('settingsModal').classList.add('is-open');
}

function describeConnection() {
    const el = document.getElementById('connectionState');
    if (!el) return;

    if (Store.live) {
        el.textContent = `Connected to ${FIREBASE_CONFIG.projectId || 'Firebase'}. ` +
            'Anyone using the app sees the same list, and additions show up on other devices within a second.';
        el.className = 'connection-state connection-ok';
    } else if (Store.source === 'cache') {
        el.textContent = 'Offline. Showing the last list saved on this device; ' +
            'anything added now uploads when the connection returns.';
        el.className = 'connection-state connection-warn';
    } else {
        el.textContent = 'Firebase is not set up yet, so the app is showing the list committed in ' +
            'database.json. Additions stay on this device until it is configured — see README.md.';
        el.className = 'connection-state connection-warn';
    }
}

function closeSettings() {
    document.getElementById('settingsModal').classList.remove('is-open');
}

function settingsStatus(text, type = 'info') {
    const el = document.getElementById('settingsStatus');
    el.textContent = text;
    el.className = `settings-status settings-status-${type}`;
}

async function reloadData() {
    settingsStatus('Reloading…');
    try {
        await initDatabase();
        document.getElementById('dataEditor').value = JSON.stringify(Store.data, null, 2);
        describeConnection();
        const from = { firebase: 'Firebase', published: 'the committed list', cache: 'this device’s cache' };
        settingsStatus(`Loaded from ${from[Store.source] || Store.source}.`, 'ok');
    } catch (err) {
        settingsStatus(err.message, 'error');
    }
}

async function saveEditedData() {
    let parsed;
    try {
        parsed = JSON.parse(document.getElementById('dataEditor').value);
    } catch (err) {
        settingsStatus(`Not valid JSON: ${err.message}`, 'error');
        return;
    }

    settingsStatus('Saving…');
    try {
        const result = await Store.replaceAll(parsed);
        applyData(Store.data);
        refreshUI();
        generateMessage();
        updateSyncBadge();

        const undone = Store.pendingRemovals();
        if (undone.length) {
            settingsStatus(
                `Saved on this device. Note: ${undone.length} removed ` +
                `${undone.length === 1 ? 'entry' : 'entries'} will reappear on reload — ` +
                'the committed list is the base until Firebase is set up.', 'warn');
        } else {
            settingsStatus(result.shared
                ? 'Saved. Everyone sees this now.'
                : 'Saved on this device only.', 'ok');
        }
    } catch (err) {
        settingsStatus(err.message, 'error');
    }
}

// A backup someone can keep, and the way to seed a new Firebase project.
function exportData() {
    const blob = new Blob([JSON.stringify(Store.data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'database.json';
    link.click();
    URL.revokeObjectURL(link.href);
}

function importData(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        document.getElementById('dataEditor').value = reader.result;
        settingsStatus('File loaded into the editor. Press "Save data" to apply it.', 'ok');
    };
    reader.readAsText(file);
    input.value = '';
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('settingsBtn').addEventListener('click', openSettings);
    document.getElementById('settingsClose').addEventListener('click', closeSettings);
    document.getElementById('dataReloadBtn').addEventListener('click', reloadData);
    document.getElementById('dataSaveBtn').addEventListener('click', saveEditedData);
    document.getElementById('dataExportBtn').addEventListener('click', exportData);
    document.getElementById('dataImportInput').addEventListener('change', e => importData(e.target));

    document.getElementById('settingsModal').addEventListener('click', e => {
        if (e.target.id === 'settingsModal') closeSettings();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeSettings();
    });

    updateSyncBadge();
});
