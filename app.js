// ── Config ───────────────────────────────────────────────────────────────────
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
    const timeString = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    
    // Pre-fill both inputs on page load
    document.getElementById('departureTime').value = timeString;
    document.getElementById('arrivalTime').value = timeString;

    ['boatName','departureFrom','destinationTo','departureTime','arrivalTime','distance','speed','fuelBurnPerHour']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', generateMessage);
        });
});

// Loads the database from the Railway backend
async function initDatabase() {
    try {
        const res  = await fetch(`${BACKEND_URL}/api/database`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Extract and sort each list in ascending alphabetical order (.sort())
        boats     = [...(data.boats     || [])].sort();
        locations = [...(data.locations || [])].sort(); // Optional: sorts locations too!
        crew      = [...(data.crew      || [])].sort();
        divers    = [...(data.divers    || [])].sort();

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
            boats.sort(); // <-- Add this to sort boats after adding
            populateDropdown('boatName', boats);
            document.getElementById('boatName').value = trimmed;
        } else {
            locations.push(trimmed);
            locations.sort(); // <-- Add this to sort locations after adding
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
    let trimmed = "";

    if (typeLabel === 'Crew') {
        // Updated input formats
        const crewDetails = prompt("Enter crew name and rank/service details (e.g., 7479 SGT Ahmed Sham):");
        if (!crewDetails || crewDetails.trim() === "") return;

        const phoneNumber = prompt("Enter phone number (e.g., 9486171):");
        if (!phoneNumber || phoneNumber.trim() === "") return;

        trimmed = `${crewDetails.trim()} — ${phoneNumber.trim()}`;
    } else {
        const newItem = prompt(`Enter new ${typeLabel.toLowerCase()} name:`);
        if (!newItem || newItem.trim() === "") return;
        trimmed = newItem.trim();
    }

    const categoryMap = { 'Crew': 'crew', 'Divers': 'divers' };
    try {
        await saveToBackend(categoryMap[typeLabel], trimmed);
        if (typeLabel === 'Crew') {
            crew.push(trimmed);
            crew.sort(); // <-- Add this to sort crew after adding
            populateCheckboxes('crewContainer', crew, 'crew');
        } else {
            divers.push(trimmed);
            divers.sort(); // <-- Add this to sort divers after adding
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

    const crewText   = selectedCrew.length   > 0 ? selectedCrew.map(n   => `• ${n}`).join('\n') : '[Crew members]';
    
    const diversBlock = selectedDivers.length > 0 
        ? `\nDIVERS LIST\n${selectedDivers.map(n => `• ${n}`).join('\n')}\n` 
        : '';

    // 1. Departure Message: Always uses the mathematically calculated auto-time
    document.getElementById('messagePreview').value =
`${boatName} Departure from ${departure} to ${destination} ${"@"}${departureTime}
${arrivalTimeBlock}
CREW LIST
${crewText}
${diversBlock}${metricsBlock}`;

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
