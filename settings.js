// ── Settings panel ────────────────────────────────────────────────────────────
// Configures GitHub sync and provides direct editing of the database.

function updateSyncBadge() {
    const badge = document.getElementById('syncBadge');
    if (!badge) return;

    const pending = Store.localOnly;

    if (Store.syncEnabled) {
        badge.textContent = '● Shared';
        badge.className = 'sync-badge sync-on';
        badge.title = `Everything you add is committed to ${Store.getSyncConfig().repo} for everyone.`;
    } else if (pending > 0) {
        badge.textContent = `● ${pending} not shared`;
        badge.className = 'sync-badge sync-pending';
        badge.title = `${pending} ${pending === 1 ? 'entry is' : 'entries are'} on this device only. ` +
                      'Connect a token in Data to share them with everyone.';
    } else {
        badge.textContent = '● Reading shared list';
        badge.className = 'sync-badge sync-read';
        badge.title = 'You see everyone\u2019s entries. To add people for everyone, connect a token in Data.';
    }

    if (Store.source === 'cache') {
        badge.textContent = '○ Offline';
        badge.className = 'sync-badge sync-off';
        badge.title = 'Showing the last list saved on this device. It may be out of date.';
    }
}

function openSettings() {
    const cfg = Store.getSyncConfig() || {};
    document.getElementById('syncRepo').value   = cfg.repo || Store.guessRepo();
    document.getElementById('syncBranch').value = cfg.branch || 'main';
    document.getElementById('syncToken').value  = cfg.token || '';
    document.getElementById('dataEditor').value = JSON.stringify(Store.data, null, 2);
    document.getElementById('settingsStatus').textContent = '';
    document.getElementById('settingsModal').classList.add('is-open');
}

function closeSettings() {
    document.getElementById('settingsModal').classList.remove('is-open');
}

function settingsStatus(text, type = 'info') {
    const el = document.getElementById('settingsStatus');
    el.textContent = text;
    el.className = `settings-status settings-status-${type}`;
}

function readSyncForm() {
    return {
        repo:   document.getElementById('syncRepo').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, ''),
        branch: document.getElementById('syncBranch').value.trim() || 'main',
        token:  document.getElementById('syncToken').value.trim(),
        path:   'database.json'
    };
}

async function saveSyncSettings() {
    const cfg = readSyncForm();
    if (!cfg.repo || !cfg.token) {
        settingsStatus('Enter both the repository and a token.', 'error');
        return;
    }
    if (!/^[\w.-]+\/[\w.-]+$/.test(cfg.repo)) {
        settingsStatus('Repository must look like owner/repo.', 'error');
        return;
    }

    settingsStatus('Checking access…');
    try {
        await Store.testSync(cfg);
        Store.setSyncConfig(cfg);
        await initDatabase();
        settingsStatus('Sync enabled. Changes now commit to GitHub.', 'ok');
        showToast('✅ GitHub sync enabled');
    } catch (err) {
        settingsStatus(err.message, 'error');
    }
}

function disableSync() {
    Store.setSyncConfig(null);
    Store.sha = null;
    document.getElementById('syncToken').value = '';
    updateSyncBadge();
    settingsStatus('Sync turned off. Changes stay on this device.', 'ok');
}

async function pullFromGitHub() {
    settingsStatus('Reloading…');
    try {
        await initDatabase();
        document.getElementById('dataEditor').value = JSON.stringify(Store.data, null, 2);
        const from = { github: 'GitHub', published: 'the published list', cache: 'this device\u2019s cache' };
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
                'deleting from the shared list needs a token.', 'warn');
        } else {
            settingsStatus(result.synced
                ? 'Saved and committed. Everyone will see this.'
                : 'Saved on this device only.', 'ok');
        }
    } catch (err) {
        settingsStatus(err.message, 'error');
    }
}

// Export/import give a way to move data between devices without a token.
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
    document.getElementById('syncSaveBtn').addEventListener('click', saveSyncSettings);
    document.getElementById('syncDisableBtn').addEventListener('click', disableSync);
    document.getElementById('syncPullBtn').addEventListener('click', pullFromGitHub);
    document.getElementById('dataSaveBtn').addEventListener('click', saveEditedData);
    document.getElementById('dataExportBtn').addEventListener('click', exportData);
    document.getElementById('dataImportInput').addEventListener('change', e => importData(e.target));

    // Click the backdrop or press Escape to dismiss.
    document.getElementById('settingsModal').addEventListener('click', e => {
        if (e.target.id === 'settingsModal') closeSettings();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeSettings();
    });

    updateSyncBadge();
});
