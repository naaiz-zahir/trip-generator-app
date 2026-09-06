// ── State ─────────────────────────────────────────────────────────────────────
let boats     = [];
let locations = [];
let crew      = [];
let divers    = [];

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    initDatabase();

    const now = new Date();
    const timeString = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    // Pre-fill both inputs on page load
    document.getElementById('departureTime').value = timeString;
    document.getElementById('arrivalTime').value = timeString;

    ['boatName','departureFrom','destinationTo','departureTime','arrivalTime','distance','speed','fuelBurnPerHour']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', generateMessage);
        });

    // Firebase pushes changes to every open device, so nothing polls here.
    // The one case worth re-checking is coming back online after a drop.
    window.addEventListener('online', () => {
        if (!Store.live) initDatabase();
    });
});

// Called whenever the shared list changes under us. Ticked crew and the chosen
// boat are preserved by refreshUI, so this is safe to happen mid-message.
function onSharedListChanged(data) {
    applyData(data);
    refreshUI();
    generateMessage();
    updateSyncBadge();
    showToast('\u{1f504} List updated');
}

// Loads the shared lists and keeps them current.
async function initDatabase() {
    try {
        Store.onChange = onSharedListChanged;
        const data = await Store.load();
        applyData(data);
        refreshUI();
        generateMessage();
        updateSyncBadge();
    } catch (err) {
        // Update the badge here too: leaving it on its initial "Loading…"
        // makes a failed load look like one that never finished.
        console.error("Could not load database:", err);
        updateSyncBadge();
        showToast(`\u26a0\ufe0f ${err.message}`, 'error');
    }
}

// Mirrors the store into the module-level lists the UI reads from.
function applyData(data) {
    boats     = data.boats;
    locations = data.locations;
    crew      = data.crew;
    divers    = data.divers;
}

// ── UI Helpers ────────────────────────────────────────────────────────────────
function refreshUI() {
    populateDropdown('boatName', boats);
    populateDropdown('departureFrom', locations);
    populateDropdown('destinationTo', locations);
    populateCheckboxes('crewContainer', crew, 'crew');
    populateCheckboxes('diversContainer', divers, 'diver');
}

function populateDropdown(elementId, items) {
    const dropdown = document.getElementById(elementId);
    const current  = dropdown.value;
    dropdown.innerHTML = "";
    items.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item;
        opt.textContent = item;
        dropdown.appendChild(opt);
    });
    if (items.includes(current)) dropdown.value = current;
}

function populateCheckboxes(containerId, items, nameAttr) {
    const container = document.getElementById(containerId);
    const checked   = new Set(
        Array.from(container.querySelectorAll('input:checked')).map(el => el.value)
    );
    container.innerHTML = "";
    items.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `${nameAttr}-${index}`;
        checkbox.value = item; // Stores full database string (with phone number)
        checkbox.name = nameAttr;
        if (checked.has(item)) checkbox.checked = true;
        checkbox.addEventListener('change', generateMessage);

        const label = document.createElement('label');
        label.setAttribute('for', `${nameAttr}-${index}`);
        
        // Hides mobile number from frontend checkbox listing
        if (nameAttr === 'crew' && item.includes(' — ')) {
            label.textContent = item.split(' — ')[0];
        } else {
            label.textContent = item;
        }

        div.appendChild(checkbox);
        div.appendChild(label);
        container.appendChild(div);
    });
}

// ── Add Items ─────────────────────────────────────────────────────────────────
// Reports where a saved change actually landed, so the user is never misled
// into thinking a device-local edit reached the rest of the squadron.
function reportSaved(label, result) {
    if (result.shared) showToast(`\u2705 "${label}" added for everyone`);
    else showToast(`\u2705 "${label}" saved on this device only`);
    updateSyncBadge();
}

async function addNewItem(elementId, typeLabel) {
    const newItem = prompt(`Enter new ${typeLabel.toLowerCase()} name:`);
    if (!newItem || newItem.trim() === "") return;
    const trimmed = newItem.trim();

    const categoryMap = { 'Boats': 'boats', 'Locations': 'locations' };
    try {
        const result = await Store.add(categoryMap[typeLabel], trimmed);
        applyData(Store.data);
        if (typeLabel === 'Boats') {
            populateDropdown('boatName', boats);
            document.getElementById('boatName').value = trimmed;
        } else {
            populateDropdown('departureFrom', locations);
            populateDropdown('destinationTo', locations);
        }
        reportSaved(trimmed, result);
        generateMessage();
    } catch (err) {
        showToast(`\u26a0\ufe0f ${err.message}`, 'error');
    }
}

async function addNewCheckboxItem(containerId, typeLabel) {
    let trimmed = "";

    if (typeLabel === 'Crew') {
        // Updated input formats
        const crewDetails = prompt("Enter crew name and rank/service details (e.g., 7479 SGT Ahmed Sham):");
        if (!crewDetails || crewDetails.trim() === "") return;

        const phoneNumber = prompt("Enter phone number (e.g., 9486171):");
        if (!phoneNumber || phoneNumber.trim() === "") return;

        trimmed = `${crewDetails.trim()} \u2014 ${phoneNumber.trim()}`;
    } else {
        const newItem = prompt(`Enter new ${typeLabel.toLowerCase()} name:`);
        if (!newItem || newItem.trim() === "") return;
        trimmed = newItem.trim();
    }

    const categoryMap = { 'Crew': 'crew', 'Divers': 'divers' };
    try {
        const result = await Store.add(categoryMap[typeLabel], trimmed);
        applyData(Store.data);
        if (typeLabel === 'Crew') {
            populateCheckboxes('crewContainer', crew, 'crew');
        } else {
            populateCheckboxes('diversContainer', divers, 'diver');
        }
        reportSaved(trimmed, result);
        generateMessage();
    } catch (err) {
        showToast(`\u26a0\ufe0f ${err.message}`, 'error');
    }
}

// ── Message Generator ─────────────────────────────────────────────────────────
function generateMessage() {
    const boatName         = document.getElementById('boatName').value         || '[Boat Name]';
    const departure        = document.getElementById('departureFrom').value    || '[]';
    const destination      = document.getElementById('destinationTo').value    || '[]';
    const departureTime    = document.getElementById('departureTime').value    || '';
    const distanceVal      = parseFloat(document.getElementById('distance').value)      || 0;
    const speedVal         = parseFloat(document.getElementById('speed').value)         || 0;
    const fuelBurnPerHour  = parseFloat(document.getElementById('fuelBurnPerHour').value) || 0;

    let fuelConsumed = (0).toFixed(1);
    let arrivalTimeBlock = ''; 
    let metricsBlock = '';

    // Calculate Estimated Arrival Time purely for the Departure Message
    if (distanceVal > 0 && speedVal > 0) {
        const hoursNeeded = distanceVal / speedVal;
        fuelConsumed = (hoursNeeded * fuelBurnPerHour).toFixed(1);

        if (departureTime) {
            const [depHours, depMinutes] = departureTime.split(':').map(Number);
            const totalMinutesNeeded = Math.round(hoursNeeded * 60);

            const arrivalDate = new Date();
            arrivalDate.setHours(depHours);
            arrivalDate.setMinutes(depMinutes + totalMinutesNeeded);

            const arrHours = String(arrivalDate.getHours()).padStart(2, '0');
            const arrMinutes = String(arrivalDate.getMinutes()).padStart(2, '0');
            
            // This goes only to the departure message text template
            arrivalTimeBlock = `Estimated Arrival ${"@"}${arrHours}:${arrMinutes}\n`;
        }

        metricsBlock = `\nDistance: ${distanceVal} nm
Speed: ${speedVal} knots
Estimated Fuel Consumed: ${fuelConsumed} L`;
    }

    // Read the separate Arrival Input field value for the Arrival Message
    const actualArrivalTimeVal = document.getElementById('arrivalTime').value;
    
    document.getElementById('fuelCalculated').textContent = fuelConsumed;

    const selectedCrew   = Array.from(document.querySelectorAll('input[name="crew"]:checked')).map(el => el.value);
    const selectedDivers = Array.from(document.querySelectorAll('input[name="diver"]:checked')).map(el => el.value);

    const crewBlock = selectedCrew.length > 0 
        ? `\nCREW LIST\n${selectedCrew.map(n => `• ${n}`).join('\n')}\n` 
        : '';
    
    const diversBlock = selectedDivers.length > 0 
        ? `\nDIVERS LIST\n${selectedDivers.map(n => `• ${n}`).join('\n')}\n` 
        : '';

    // 1. Departure Message: Always uses the mathematically calculated auto-time
    document.getElementById('messagePreview').value =
`${boatName} Departure from ${departure} to ${destination} ${"@"}${departureTime}
${arrivalTimeBlock}${crewBlock}${diversBlock}${metricsBlock}`;

    // 2. Arrival Message: Uses the isolated input field from the bottom of the form
    document.getElementById('arrivalMessagePreview').value =
    `${boatName} Arrived to ${destination} ${"@"}${actualArrivalTimeVal || '--:--'}`;
}

// ── Copy Button (Departure) ──────────────────────────────────────────────────
document.getElementById('copyBtn').addEventListener('click', () => {
    const messageArea = document.getElementById('messagePreview');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(messageArea.value)
            .then(() => alertFlash('copyBtn'))
            .catch(err => alert("Copy failed: " + err));
    } else {
        messageArea.select();
        document.execCommand('copy');
        alertFlash('copyBtn');
    }
});

// 1. Departure Viber Share
document.getElementById('viber-share-btn').addEventListener('click', function() {
    const departureText = document.getElementById('messagePreview').value.trim();
    
    if (!departureText) {
        alert('There is no departure message to share yet.');
        return;
    }
    
    window.location.href = `viber://forward?text=${encodeURIComponent(departureText)}`;
});

// ── Copy Button (Arrival) ────────────────────────────────────────────────────
document.getElementById('copyArrivalBtn').addEventListener('click', () => {
    const messageArea = document.getElementById('arrivalMessagePreview');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(messageArea.value)
            .then(() => alertFlash('copyArrivalBtn'))
            .catch(err => alert("Copy failed: " + err));
    } else {
        messageArea.select();
        document.execCommand('copy');
        alertFlash('copyArrivalBtn');
    }
});

// 2. Arrival Viber Share
document.getElementById('viber-share-arrival-btn').addEventListener('click', function() {
    const arrivalText = document.getElementById('arrivalMessagePreview').value.trim();
    
    if (!arrivalText) {
        alert('There is no arrival message to share yet.');
        return;
    }
    
    window.location.href = `viber://forward?text=${encodeURIComponent(arrivalText)}`;
});

// Updated flash function to handle multiple button IDs dynamically
function alertFlash(btnId) {
    const btn = document.getElementById(btnId);
    const originalText = btn.textContent;
    const originalBg = btn.style.background;
    
    btn.textContent = "✅ Copied to Clipboard!";
    btn.style.background = "linear-gradient(135deg, #28a745, #1e7e34)";
    setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = originalBg;
    }, 2000);
}

// ── Status badge ──────────────────────────────────────────────────────────────
function updateSyncBadge() {
    const badge = document.getElementById('syncBadge');
    if (!badge) return;

    const pending = Store.localOnly;

    if (Store.live) {
        badge.textContent = '\u25cf Live';
        badge.className = 'sync-badge sync-on';
        badge.title = 'Everyone sees the same list. Changes appear on other devices straight away.';
    } else if (Store.source === 'cache') {
        badge.textContent = '\u25cb Offline';
        badge.className = 'sync-badge sync-off';
        badge.title = 'Showing the last list saved on this device. It may be out of date.';
    } else if (pending > 0) {
        badge.textContent = `\u25cf ${pending} not shared`;
        badge.className = 'sync-badge sync-pending';
        badge.title = `${pending} ${pending === 1 ? 'entry is' : 'entries are'} on this device only, ` +
                      'and will upload once the shared list is reachable.';
    } else if (Store.source === 'none') {
        badge.textContent = '\u26a0 Not loaded';
        badge.className = 'sync-badge sync-pending';
        badge.title = 'The lists could not be loaded. Check the connection and reload.';
    } else {
        badge.textContent = '\u25cf Read only';
        badge.className = 'sync-badge sync-read';
        badge.title = 'Showing the list committed in the repository. ' +
                      'Firebase is not reachable, so additions stay on this device.';
    }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(message, type = 'success') {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = `toast toast-${type} toast-show`;
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('toast-show'), 3000);
}
