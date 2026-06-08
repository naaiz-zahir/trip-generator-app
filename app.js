// ── Config ───────────────────────────────────────────────────────────────────
// Replace this with your Railway backend URL once deployed.
// Example: 'https://trip-app-production.up.railway.app'
const BACKEND_URL = 'https://trip-generator-production.up.railway.app';

// ── State ─────────────────────────────────────────────────────────────────────
let boats     = [];
let locations = [];
let crew      = [];
let divers    = [];

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    initDatabase();

    const now = new Date();
    document.getElementById('departureTime').value =
        `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    ['boatName','departureFrom','destinationTo','departureTime','distance','fuelBurn']
        .forEach(id => document.getElementById(id).addEventListener('input', generateMessage));
});

// Loads the database from the Railway backend
async function initDatabase() {
    try {
        const res  = await fetch(`${BACKEND_URL}/api/database`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        boats     = [...(data.boats     || [])];
        locations = [...(data.locations || [])];
        crew      = [...(data.crew      || [])];
        divers    = [...(data.divers    || [])];

        refreshUI();
        generateMessage();
    } catch (err) {
        console.error("Could not load database:", err);
        showToast("⚠️ Could not connect to backend", 'error');
    }
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
        div.innerHTML = `
            <input type="checkbox" id="${nameAttr}-${index}" value="${item}" name="${nameAttr}"
                ${checked.has(item) ? 'checked' : ''}
                onchange="generateMessage()">
            <label for="${nameAttr}-${index}">${item}</label>
        `;
        container.appendChild(div);
    });
}

// ── Add Items ─────────────────────────────────────────────────────────────────
async function saveToBackend(category, value) {
    const res = await fetch(`${BACKEND_URL}/api/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, value })
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Server error');
    }
    return res.json();
}

async function addNewItem(elementId, typeLabel) {
    const newItem = prompt(`Enter new ${typeLabel.toLowerCase()} name:`);
    if (!newItem || newItem.trim() === "") return;
    const trimmed = newItem.trim();

    const categoryMap = { 'Boats': 'boats', 'Locations': 'locations' };
    try {
        await saveToBackend(categoryMap[typeLabel], trimmed);
        if (typeLabel === 'Boats') {
            boats.push(trimmed);
            populateDropdown('boatName', boats);
            document.getElementById('boatName').value = trimmed;
        } else {
            locations.push(trimmed);
            populateDropdown('departureFrom', locations);
            populateDropdown('destinationTo', locations);
        }
        showToast(`✅ "${trimmed}" saved`);
        generateMessage();
    } catch (err) {
        showToast(`⚠️ ${err.message}`, 'error');
    }
}

async function addNewCheckboxItem(containerId, typeLabel) {
    const newItem = prompt(`Enter new ${typeLabel.toLowerCase()} name:`);
    if (!newItem || newItem.trim() === "") return;
    const trimmed = newItem.trim();

    const categoryMap = { 'Crew': 'crew', 'Divers': 'divers' };
    try {
        await saveToBackend(categoryMap[typeLabel], trimmed);
        if (typeLabel === 'Crew') {
            crew.push(trimmed);
            populateCheckboxes('crewContainer', crew, 'crew');
        } else {
            divers.push(trimmed);
            populateCheckboxes('diversContainer', divers, 'diver');
        }
        showToast(`✅ "${trimmed}" saved`);
        generateMessage();
    } catch (err) {
        showToast(`⚠️ ${err.message}`, 'error');
    }
}

// ── Message Generator ─────────────────────────────────────────────────────────
function generateMessage() {
    const boatName      = document.getElementById('boatName').value      || '[Boat Name]';
    const departure     = document.getElementById('departureFrom').value  || '[]';
    const destination   = document.getElementById('destinationTo').value  || '[]';
    const departureTime = document.getElementById('departureTime').value  || '';
    const distanceVal   = parseFloat(document.getElementById('distance').value)  || 0;
    const fuelBurnVal   = parseFloat(document.getElementById('fuelBurn').value)  || 0;

    const fuelConsumed = (distanceVal * fuelBurnVal).toFixed(1);
    document.getElementById('fuelCalculated').textContent = fuelConsumed;

    const selectedCrew   = Array.from(document.querySelectorAll('input[name="crew"]:checked')).map(el => el.value);
    const selectedDivers = Array.from(document.querySelectorAll('input[name="diver"]:checked')).map(el => el.value);

    const crewText   = selectedCrew.length   > 0 ? selectedCrew.map(n   => `- ${n}`).join('\n') : '[Crew members]';
    
    // Create the entire Divers Block dynamically.
    // If divers are selected, it includes the block header and items; otherwise, it stays completely empty.
    const diversBlock = selectedDivers.length > 0 
        ? `\nDIVERS LIST\n${selectedDivers.map(n => `- ${n}`).join('\n')}\n` 
        : '';

    document.getElementById('messagePreview').value =
`${boatName} Departure from ${departure} to ${destination}
Time: ${departureTime}

CREW LIST
${crewText}
${diversBlock}
Distance: ${distanceVal} nm
Fuel Consumed: ${fuelConsumed} L`;
}

// ── Copy Button ───────────────────────────────────────────────────────────────
document.getElementById('copyBtn').addEventListener('click', () => {
    const messageArea = document.getElementById('messagePreview');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(messageArea.value)
            .then(alertFlash)
            .catch(err => alert("Copy failed: " + err));
    } else {
        messageArea.select();
        document.execCommand('copy');
        alertFlash();
    }
});

function alertFlash() {
    const btn = document.getElementById('copyBtn');
    const originalText = btn.textContent;
    btn.textContent = "✅ Copied to Clipboard!";
    btn.style.background = "linear-gradient(135deg, #28a745, #1e7e34)";
    setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = "";
    }, 2000);
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
