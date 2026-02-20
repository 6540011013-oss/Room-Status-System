/* ================= APP-B.JS (UPDATED FOR RADIO BUTTONS) ================= */

let currentRoom = null;
let currentViewingRoom = null;
let currentCategoryFilter = 'all';
let currentImageData = '';
let activeFilters = new Set();
let occupancyChart = null;
let maintenanceChart = null;
const BUILDING_ID = 'B';
const API_URL = 'api.php';
const DATE_STORAGE_KEY = 'room_snapshot_date_b_v1';

async function apiRequest(action, payload = {}) {
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...payload })
        });
        const data = await res.json();
        if (!data || data.ok !== true) {
            throw new Error((data && data.error) ? data.error : 'API error');
        }
        return data;
    } catch (err) {
        console.warn('API request failed:', err);
        return null;
    }
}

function formatDateLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getTodayLocal() {
    return formatDateLocal(new Date());
}

let selectedSnapshotDate = localStorage.getItem(DATE_STORAGE_KEY) || getTodayLocal();

async function syncTypeAndMaintFromDbB() {
    const [typesRes, maintRes] = await Promise.all([
        apiRequest('get_room_types'),
        apiRequest('get_maintenance_categories')
    ]);

    if (typesRes && Array.isArray(typesRes.room_types) && typesRes.room_types.length) {
        localStorage.setItem('room_types_final_v1', JSON.stringify(typesRes.room_types));
    }

    if (maintRes && Array.isArray(maintRes.maintenance_categories) && maintRes.maintenance_categories.length) {
        localStorage.setItem('maint_cats_final_v1', JSON.stringify(maintRes.maintenance_categories));
    }
}

const ROOM_COLORS = {};

const DEFAULT_ITEM_CATEGORIES = [
    { name: 'เฟอร์นิเจอร์', label: 'Furniture', icon: '🛋️', sort_order: 10 },
    { name: 'เครื่องใช้ไฟฟ้า', label: 'Appliances', icon: '💡', sort_order: 20 },
    { name: 'ของตกแต่ง', label: 'Decor', icon: '🖼️', sort_order: 30 },
    { name: 'อื่นๆ', label: 'Other', icon: '📦', sort_order: 40 }
];
let itemCategories = [...DEFAULT_ITEM_CATEGORIES];

function normalizeCategoryName(raw) {
    return String(raw || '').trim();
}

function getItemCategories() {
    if (!Array.isArray(itemCategories) || !itemCategories.length) return DEFAULT_ITEM_CATEGORIES;
    return itemCategories;
}

function getCategoryMeta(name) {
    const key = normalizeCategoryName(name);
    const found = getItemCategories().find(c => normalizeCategoryName(c.name) === key);
    if (found) return found;
    return { name: key || 'อื่นๆ', label: key || 'Other', icon: '📦' };
}

async function syncItemCategoriesFromDbB() {
    const res = await apiRequest('get_item_categories');
    if (res && Array.isArray(res.item_categories) && res.item_categories.length) {
        itemCategories = res.item_categories.map(row => ({
            name: normalizeCategoryName(row.name),
            label: String(row.label || row.name || '').trim() || normalizeCategoryName(row.name),
            icon: String(row.icon || '📦').trim() || '📦',
            sort_order: Number(row.sort_order || 0)
        }));
    } else {
        itemCategories = [...DEFAULT_ITEM_CATEGORIES];
    }
    renderCategoryFiltersB();
    renderCategorySelectOptionsB();
}

function renderCategoryFiltersB() {
    const wrap = document.getElementById('category-filters');
    if (!wrap) return;
    const valid = new Set(getItemCategories().map(c => c.name));
    const isAdmin = localStorage.getItem("isAdmin") === "true";
    if (currentCategoryFilter !== 'all' && !valid.has(currentCategoryFilter)) {
        currentCategoryFilter = 'all';
    }
    const chips = [];
    chips.push(`<button type="button" onclick="filterItems('all')" class="category-filter whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition cursor-pointer border-none" data-cat="all">All</button>`);
    getItemCategories().forEach(cat => {
        const escaped = cat.name.replace(/'/g, "\\'");
        const delBtn = isAdmin
            ? `<button type="button" onclick="deleteItemCategory('${escaped}')" class="h-8 w-8 rounded-full bg-red-100 text-red-600 hover:bg-red-200 font-bold transition cursor-pointer border-none" title="Delete category">✕</button>`
            : '';
        chips.push(`<div class="inline-flex items-center gap-1"><button type="button" onclick="filterItems('${escaped}')" class="category-filter whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition cursor-pointer border-none bg-slate-100 text-slate-700 hover:bg-slate-200" data-cat="${cat.name}">${cat.icon} ${cat.label}</button>${delBtn}</div>`);
    });
    if (isAdmin) {
        chips.push(`<button type="button" onclick="openAddCategoryModal()" class="whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition cursor-pointer border-none">＋ Add Category</button>`);
    }
    wrap.innerHTML = chips.join('');
    filterItems(currentCategoryFilter || 'all');
}

function renderCategorySelectOptionsB() {
    const select = document.getElementById('item-category-input');
    if (!select) return;
    select.innerHTML = getItemCategories().map(cat => `<option value="${cat.name}">${cat.icon} ${cat.label}</option>`).join('');
    if (!select.value && getItemCategories().length) {
        select.value = getItemCategories()[0].name;
    }
}

window.openAddCategoryModal = async function() {
    if (localStorage.getItem("isAdmin") !== "true") {
        alert("Admin only.");
        return;
    }
    const label = prompt('Category name (e.g., Electronics):');
    if (!label || !label.trim()) return;
    const icon = prompt('Category icon (emoji), e.g., 💻', '📦') || '📦';
    const name = label.trim();
    const sortOrder = (getItemCategories().length + 1) * 10;
    const res = await apiRequest('add_item_category', {
        name,
        label: name,
        icon: icon.trim() || '📦',
        sort_order: sortOrder
    });
    if (!res) {
        alert('Cannot save category.');
        return;
    }
    await syncItemCategoriesFromDbB();
};

window.deleteItemCategory = async function(name) {
    if (localStorage.getItem("isAdmin") !== "true") {
        alert("Admin only.");
        return;
    }
    const categoryName = normalizeCategoryName(name);
    if (!categoryName) return;
    if (getItemCategories().length <= 1) {
        alert('At least 1 category must remain.');
        return;
    }
    if (!confirm(`Delete category "${categoryName}" ?`)) return;
    const res = await apiRequest('delete_item_category', { name: categoryName });
    if (!res) {
        alert('Cannot delete category.');
        return;
    }
    await syncItemCategoriesFromDbB();
};

function getRoomElementsB() { return Array.from(document.querySelectorAll('.room-b')); }
function getRoomNumberB(room) { return room.querySelector('.r-num')?.innerText?.trim() || "0000"; }
function getRoomIdB(room) { return (room.getAttribute('data-room-id') || getRoomNumberB(room)).trim(); }

let roomInfoMapCache = {};

async function loadRoomInfoMapFromDb(date) {
    const res = await apiRequest('get_room_items_snapshot', { building: BUILDING_ID, snapshot_date: date });
    const map = {};
    if (res && Array.isArray(res.items)) {
        res.items.forEach(row => {
            try {
                map[row.room_id] = JSON.parse(row.items_json || '[]');
            } catch {
                map[row.room_id] = [];
            }
        });
    }
    roomInfoMapCache = map;
    return map;
}

function loadRoomInfoMapB() {
    return roomInfoMapCache;
}

async function saveRoomInfoMapForRoom(roomId) {
    const items = roomInfoMapCache[roomId] || [];
    await apiRequest('save_room_items_snapshot', {
        building: BUILDING_ID,
        room_id: roomId,
        snapshot_date: selectedSnapshotDate,
        items_json: JSON.stringify(items)
    });
}

const ROOM_STATE_KEY_B = 'room_state_b_v1';
function loadRoomStateMapB() {
    try { return JSON.parse(localStorage.getItem(ROOM_STATE_KEY_B)) || {}; }
    catch { return {}; }
}
function saveRoomStateMapB(map) { localStorage.setItem(ROOM_STATE_KEY_B, JSON.stringify(map)); }
function persistRoomStateB(roomElement, data) {
    const roomId = getRoomIdB(roomElement);
    const map = loadRoomStateMapB();
    map[roomId] = data;
    saveRoomStateMapB(map);
    saveRoomStateToDbB(roomId, data);
    saveRoomSnapshotToDbB(roomId, data);
}

function clearRoomTypeColorsB() {
    getRoomElementsB().forEach(room => {
        Array.from(room.classList).forEach(c => {
            if (c.startsWith('type-')) room.classList.remove(c);
        });
        room.style.setProperty('background-color', 'transparent', 'important');
        room.style.setProperty('border-color', '#e2e8f0', 'important');
    });
}

async function saveRoomStateToDbB(roomId, data) {
    await apiRequest('save_room_state', {
        building: BUILDING_ID,
        room_id: roomId,
        guest_name: data.guestName || '',
        room_type: data.typeClass || '',
        room_note: data.roomNote || '',
        maint_status: data.maintStatus || '',
        maint_note: data.maintNote || '',
        ap_installed: data.apChecked ? 1 : 0,
        ap_install_date: data.apDate || '',
        bed_badge: data.bedBadge || ''
    });
}

async function saveRoomSnapshotToDbB(roomId, data) {
    await apiRequest('save_room_snapshot', {
        building: BUILDING_ID,
        room_id: roomId,
        snapshot_date: selectedSnapshotDate,
        guest_name: data.guestName || '',
        room_type: data.typeClass || '',
        room_note: data.roomNote || '',
        maint_status: data.maintStatus || '',
        maint_note: data.maintNote || '',
        ap_installed: data.apChecked ? 1 : 0,
        ap_install_date: data.apDate || '',
        bed_badge: data.bedBadge || ''
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    const editModeBtn = document.getElementById('edit-mode-btn');
    const editIcon = document.getElementById('edit-icon');
    const editText = document.getElementById('edit-mode-text');
    const isAdminUser = () => localStorage.getItem("isAdmin") === "true";
    window.isEditModeB = false;

    clearRoomTypeColorsB();
    await syncTypeAndMaintFromDbB();
    await syncItemCategoriesFromDbB();
    if (editModeBtn) {
        if (!isAdminUser()) {
            window.isEditModeB = false;
            if (editIcon) editIcon.innerText = "๐”’";
            if (editText) editText.innerText = "Lock Mode";
            editModeBtn.classList.remove('bg-orange-500', 'text-white');
        }
        if (editIcon) editIcon.innerText = "๐”’";
        editModeBtn.onclick = function() {
            if (selectedSnapshotDate !== getTodayLocal()) { alert("View only (past date)."); return; }
            if (!isAdminUser()) { alert("Admin only."); return; }
            window.isEditModeB = !window.isEditModeB;
            if (editIcon) editIcon.innerText = window.isEditModeB ? "๐”“" : "๐”’";
            if (editText) editText.innerText = window.isEditModeB ? "Edit Mode: ON" : "Lock Mode";
            this.classList.toggle('bg-orange-500', window.isEditModeB);
            this.classList.toggle('text-white', window.isEditModeB);
            this.classList.toggle('btn-edit-on', window.isEditModeB);
        };
    }

    initRoomClicks();
    initModalEvents();
    initAdminButtonShared();
    initDashboardSummaryB();
    initImagePickerB();
    applySavedRoomStatesB();
    applyRoomStatesFromDbB();
    loadRoomInfoMapFromDb(selectedSnapshotDate);
    applyRoomIconsB();
});

function renderDateStripB() {
    const strip = document.getElementById('dateStrip');
    if (!strip) return;
    strip.innerHTML = '';
    const today = new Date();
    for (let i = 0; i < 30; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dateStr = formatDateLocal(d);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'date-pill' + (dateStr === selectedSnapshotDate ? ' active' : '');
        btn.textContent = String(d.getDate());
        btn.title = dateStr;
        btn.addEventListener('click', async () => {
            selectedSnapshotDate = dateStr;
            localStorage.setItem(DATE_STORAGE_KEY, selectedSnapshotDate);
            renderDateStripB();
            await applyRoomStatesFromDbB();
            await loadRoomInfoMapFromDb(selectedSnapshotDate);
        });
        strip.appendChild(btn);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    renderDateStripB();
});

function initAdminButtonShared() {
    const adminBtn = document.getElementById("adminBtnShared");
    const btnText = document.getElementById("btnTextShared");
    const btnIcon = document.getElementById("btnIconShared");
    if (!adminBtn || !btnText || !btnIcon) return;

    const adminClass = "flex items-center gap-2 px-6 py-2.5 rounded-full bg-green-600 border-2 border-green-600 text-white text-xs font-black hover:bg-green-700 transition-all duration-300 group shadow-sm";
    const guestClass = "flex items-center gap-2 px-6 py-2.5 rounded-full border-2 border-slate-800 text-slate-800 text-xs font-black hover:bg-slate-800 hover:text-white transition-all duration-300 group shadow-sm";

    const setAdminState = () => {
        btnText.textContent = "ADMIN ACTIVE";
        adminBtn.className = adminClass;
        btnIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />';
        btnIcon.classList.remove("group-hover:translate-x-1");
    };

    const setGuestState = () => {
        btnText.textContent = "STAFF LOGIN";
        adminBtn.className = guestClass;
        btnIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />';
        btnIcon.classList.add("group-hover:translate-x-1");
    };

    const applyState = () => {
        if (localStorage.getItem("isAdmin") === "true") setAdminState();
        else setGuestState();
    };

    adminBtn.addEventListener("click", () => {
        if (localStorage.getItem("isAdmin") === "true") {
            if (confirm("Log out of Admin?")) {
                localStorage.removeItem("isAdmin");
                applyState();
            }
        } else {
            localStorage.setItem("showLoginModal", "true");
            window.location.href = "index.html";
        }
    });

    window.addEventListener("storage", (e) => {
        if (e.key === "isAdmin") applyState();
    });

    applyState();
}

function initRoomClicks() {
    const rooms = document.querySelectorAll('.room-b');
    rooms.forEach(room => {
        room.addEventListener('click', () => {
            const isAdmin = localStorage.getItem("isAdmin") === "true";
            const isEditMode = window.isEditModeB === true;
            if (selectedSnapshotDate !== getTodayLocal()) { openRoomInfoModal(room); return; }
            if (isEditMode && isAdmin) openEditorDb(room);
            else openRoomInfoModal(room);
        });
    });
}

async function openEditorDb(roomElement) {
    currentRoom = roomElement;

    const roomId = getRoomIdB(roomElement);
    const roomNum = roomElement.querySelector('.r-num')?.innerText || 'Unknown';

    let dbState = null;
    const res = await apiRequest('get_room_state', { building: BUILDING_ID, room_id: roomId });
    if (res && res.room) dbState = res.room;

    const guestName = dbState ? (dbState.guest_name || '') : (roomElement.querySelector('.r-guest')?.innerText || '');

    let currentType = 'type-suc';
    if (dbState && dbState.room_type) currentType = dbState.room_type;
    else if (roomElement.classList.contains('type-condo')) currentType = 'type-condo';

    let currentBed = 'none';
    if (dbState && dbState.bed_badge) {
        currentBed = dbState.bed_badge;
    } else {
        const badge = roomElement.querySelector('.bed-badge');
        if (badge) {
            if (badge.classList.contains('bg-db')) currentBed = 'db';
            if (badge.classList.contains('bg-triple')) currentBed = 'triple';
        }
    }

    const maintStatus = dbState ? (dbState.maint_status || '').trim() : (roomElement.getAttribute('data-maint') || '').trim();
    const roomNote = dbState ? (dbState.room_note || '').trim() : (roomElement.getAttribute('data-room-note') || '').trim();
    const maintNote = dbState ? (dbState.maint_note || '').trim() : (roomElement.getAttribute('data-maint-note') || '').trim();
    const apInstalled = dbState ? !!dbState.ap_installed : (roomElement.getAttribute('data-ap') === 'true');
    const apDate = dbState ? (dbState.ap_install_date || '') : (roomElement.getAttribute('data-ap-date') || '');

    document.getElementById('modalRoomNum').innerText = roomNum;
    document.getElementById('modalGuestName').value = guestName;
    document.getElementById('modalRoomType').value = currentType;
    const maintSelect = document.getElementById('modalMaintStatus');
    if (maintSelect) maintSelect.value = maintStatus;
    const roomNoteInput = document.getElementById('modalRoomNote');
    if (roomNoteInput) roomNoteInput.value = roomNote;
    const maintNoteInput = document.getElementById('modalMaintNote');
    if (maintNoteInput) maintNoteInput.value = maintNote;
    const apCheck = document.getElementById('modalHasAP');
    const apDateInput = document.getElementById('modalAPDate');
    if (apCheck) apCheck.checked = apInstalled;
    if (apDateInput) apDateInput.value = apDate;

    const radios = document.getElementsByName('bedBadge');
    radios.forEach(r => {
        if (r.value === currentBed) r.checked = true;
    });

    document.getElementById('roomModal').classList.remove('hidden');
}

function openEditor(roomElement) {
    currentRoom = roomElement; 

    // 1. เธ”เธถเธเธเนเธญเธกเธนเธฅเน€เธ”เธดเธก
    const roomNum = roomElement.querySelector('.r-num')?.innerText || "Unknown";
    const guestName = roomElement.querySelector('.r-guest')?.innerText || "";
    
    // 2. เธ”เธถเธ Type
    let currentType = 'type-suc'; 
    if (roomElement.classList.contains('type-condo')) currentType = 'type-condo';

    // 3. เธ”เธถเธ Bed Badge (DB/3P)
    let currentBed = 'none';
    const badge = roomElement.querySelector('.bed-badge');
    if (badge) {
        if (badge.classList.contains('bg-db')) currentBed = 'db';
        if (badge.classList.contains('bg-triple')) currentBed = 'triple';
    }

    const maintStatus = (roomElement.getAttribute('data-maint') || '').trim();
    const roomNote = (roomElement.getAttribute('data-room-note') || '').trim();
    const maintNote = (roomElement.getAttribute('data-maint-note') || '').trim();
    const apInstalled = roomElement.getAttribute('data-ap') === 'true';
    const apDate = roomElement.getAttribute('data-ap-date') || '';

    // --- เน€เธญเธฒเธเนเธญเธกเธนเธฅเนเธเนเธชเนเนเธ Modal ---
    document.getElementById('modalRoomNum').innerText = roomNum;
    document.getElementById('modalGuestName').value = guestName;
    document.getElementById('modalRoomType').value = currentType;
    const maintSelect = document.getElementById('modalMaintStatus');
    if (maintSelect) maintSelect.value = maintStatus;
    const roomNoteInput = document.getElementById('modalRoomNote');
    if (roomNoteInput) roomNoteInput.value = roomNote;
    const maintNoteInput = document.getElementById('modalMaintNote');
    if (maintNoteInput) maintNoteInput.value = maintNote;
    const apCheck = document.getElementById('modalHasAP');
    const apDateInput = document.getElementById('modalAPDate');
    if (apCheck) apCheck.checked = apInstalled;
    if (apDateInput) apDateInput.value = apDate;

    // ๐”ฅ เธชเธฑเนเธเธ•เธดเนเธ Radio Button เธ•เธฒเธกเธเนเธฒเน€เธ”เธดเธก
    const radios = document.getElementsByName('bedBadge');
    radios.forEach(r => {
        if (r.value === currentBed) r.checked = true;
    });

    document.getElementById('roomModal').classList.remove('hidden');
}

function saveRoomChanges() {
    if (!currentRoom) return;
    if (selectedSnapshotDate !== getTodayLocal()) { alert("View only (past date)."); return; }

    const newGuest = document.getElementById('modalGuestName').value;
    const newType = document.getElementById('modalRoomType').value;
    const maintStatus = (document.getElementById('modalMaintStatus')?.value || '').trim();
    const roomNote = (document.getElementById('modalRoomNote')?.value || '').trim();
    const maintNote = (document.getElementById('modalMaintNote')?.value || '').trim();
    const apInstalled = document.getElementById('modalHasAP')?.checked;
    const apDate = document.getElementById('modalAPDate')?.value || '';

    // ๐”ฅ เธซเธฒเธเนเธฒเธเธฒเธ Radio เธ—เธตเนเธ–เธนเธเธ•เธดเนเธ
    let newBed = 'none';
    const radios = document.getElementsByName('bedBadge');
    radios.forEach(r => {
        if (r.checked) newBed = r.value;
    });

    // 1. เธญเธฑเธเน€เธ”เธ•เธเธทเนเธญ
    let guestSpan = currentRoom.querySelector('.r-guest');
    if (!guestSpan) {
        guestSpan = document.createElement('span');
        guestSpan.className = 'r-guest';
        currentRoom.appendChild(guestSpan);
    }
    guestSpan.innerText = newGuest;

    // 2. เธญเธฑเธเน€เธ”เธ•เธชเธตเธซเนเธญเธ
    currentRoom.classList.remove('type-suc', 'type-condo');
    currentRoom.classList.add(newType);

    currentRoom.setAttribute('data-maint', maintStatus);
    currentRoom.setAttribute('data-room-note', roomNote);
    currentRoom.setAttribute('data-maint-note', maintNote);
    currentRoom.setAttribute('data-ap', apInstalled ? 'true' : 'false');
    currentRoom.setAttribute('data-ap-date', apDate);

    if (newType) {
        const typeColor = getRoomTypeColor(newType);
        if (typeColor) currentRoom.style.setProperty('background-color', typeColor, 'important');
        else currentRoom.style.setProperty('background-color', 'transparent', 'important');
    } else {
        currentRoom.style.setProperty('background-color', 'transparent', 'important');
    }

    // 3. เธญเธฑเธเน€เธ”เธ•เธเนเธฒเธข Bed Badge
    const oldBadge = currentRoom.querySelector('.bed-badge');
    if (oldBadge) oldBadge.remove();

    if (newBed !== 'none') {
        const badgeDiv = document.createElement('div');
        badgeDiv.classList.add('bed-badge');
        
        if (newBed === 'db') {
            badgeDiv.classList.add('bg-db');
            badgeDiv.innerText = 'DB';
        } else if (newBed === 'triple') {
            badgeDiv.classList.add('bg-triple');
            badgeDiv.innerText = '3P';
        }
        currentRoom.appendChild(badgeDiv);
    }

    currentRoom.querySelectorAll('.ap-badge, .maint-icon').forEach(el => el.remove());
    if (apInstalled) {
        const label = apDate ? `Installed: ${apDate}` : 'Installed: Unspecified';
        currentRoom.insertAdjacentHTML('beforeend', `<div class="ap-badge" data-info="${label}"><span class="ap-dot"></span></div>`);
    }
    if (maintStatus) {
        const icon = getMaintIconB(maintStatus) || '๐”ง';
        const note = maintNote ? `Task: ${maintNote}` : 'Task: Unspecified';
        currentRoom.insertAdjacentHTML('beforeend', `<div class="maint-icon" data-info="${note}">${icon}</div>`);
        document.body.classList.add('show-filter-icons');
    }

    persistRoomStateB(currentRoom, {
        guestName: newGuest,
        typeClass: newType,
        roomNote,
        maintStatus,
        maintNote,
        apChecked: !!apInstalled,
        apDate,
        bedBadge: newBed
    });

    closeModal();
}

function closeModal() {
    document.getElementById('roomModal').classList.add('hidden');
    currentRoom = null;
}

function applyRoomStatesB(map) {
    if (!map || typeof map !== 'object') return;

    getRoomElementsB().forEach(room => {
        const roomId = getRoomIdB(room);
        const state = map[roomId];
        if (!state) return;

        const guestName = state.guestName ?? state.guest_name ?? '';
        const typeClass = state.typeClass ?? state.room_type ?? '';
        const roomNote = (state.roomNote ?? state.room_note ?? '').trim();
        const maintStatus = (state.maintStatus ?? state.maint_status ?? '').trim();
        const maintNote = (state.maintNote ?? state.maint_note ?? '').trim();
        const apChecked = !!(state.apChecked ?? state.ap_installed);
        const apDate = state.apDate ?? state.ap_install_date ?? '';
        const bedBadge = state.bedBadge ?? state.bed_badge ?? 'none';

        let guestSpan = room.querySelector('.r-guest');
        if (!guestSpan) {
            guestSpan = document.createElement('span');
            guestSpan.className = 'r-guest';
            room.appendChild(guestSpan);
        }
        guestSpan.innerText = guestName;

        Array.from(room.classList).forEach(c => {
            if (c.startsWith('type-')) room.classList.remove(c);
        });

        room.setAttribute('data-maint', maintStatus);
        room.setAttribute('data-room-note', roomNote);
        room.setAttribute('data-maint-note', maintNote);
        room.setAttribute('data-ap', apChecked ? 'true' : 'false');
        room.setAttribute('data-ap-date', apDate);
        if (typeClass) {
            const typeColor = getRoomTypeColor(typeClass);
            if (typeColor) room.style.setProperty('background-color', typeColor, 'important');
        } else {
            room.style.setProperty('background-color', 'transparent', 'important');
        }

        const oldBadge = room.querySelector('.bed-badge');
        if (oldBadge) oldBadge.remove();
        if (bedBadge && bedBadge !== 'none') {
            const badgeDiv = document.createElement('div');
            badgeDiv.classList.add('bed-badge');
            if (bedBadge === 'db') {
                badgeDiv.classList.add('bg-db');
                badgeDiv.innerText = 'DB';
            } else if (bedBadge === 'triple') {
                badgeDiv.classList.add('bg-triple');
                badgeDiv.innerText = '3P';
            }
            room.appendChild(badgeDiv);
        }
    });
}

function applySavedRoomStatesB() {
    const map = loadRoomStateMapB();
    applyRoomStatesB(map);
}

async function applyRoomStatesFromDbB() {
    const isToday = selectedSnapshotDate === getTodayLocal();
    const res = isToday
        ? await apiRequest('get_all_room_states', { building: BUILDING_ID })
        : await apiRequest('get_room_snapshots', { building: BUILDING_ID, snapshot_date: selectedSnapshotDate });
    if (!res || !Array.isArray(res.rooms)) return;
    const map = {};
    res.rooms.forEach(row => { map[row.room_id] = row; });
    applyRoomStatesB(map);
}

function initModalEvents() {
    const cancelBtn = document.querySelector('.cancel-btn');
    const saveBtn = document.querySelector('.save-btn');
    const modal = document.getElementById('roomModal');

    if(cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if(saveBtn) saveBtn.addEventListener('click', saveRoomChanges);
    if(modal) modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

function renderRoomInfoListB(roomId) {
    const listEl = document.getElementById('items-grid');
    const emptyState = document.getElementById('empty-state');
    const countBadge = document.getElementById('itemCount');
    if (!listEl) return;

    const map = loadRoomInfoMapB();
    let items = map[roomId] || [];
    if (countBadge) countBadge.innerText = items.length;

    if (currentCategoryFilter !== 'all') {
        items = items.filter(item => item.category === currentCategoryFilter);
    }

    listEl.innerHTML = '';

    if (!items.length) {
        listEl.classList.add('hidden');
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    listEl.classList.remove('hidden');
    if (emptyState) emptyState.classList.add('hidden');

    items.forEach((item) => {
        const realIndex = (map[roomId] || []).indexOf(item);
        const category = item.category || 'อื่นๆ';
        const categoryMeta = getCategoryMeta(category);
        const displayCategory = categoryMeta.label;
        const icon = categoryMeta.icon;
        const dimText = (item.width || item.height) ? `${item.width || '-'} ร— ${item.height || '-'} cm` : 'Size not specified';
        const noteText = String(item.note || '').trim();
        const noteHtml = noteText
            ? `<p class="text-slate-600 text-sm mb-4 break-words">${noteText}</p>`
            : '';

        const card = document.createElement('div');
        card.className = 'item-card bg-white rounded-2xl overflow-hidden shadow-lg border border-slate-100 cursor-pointer';

        let imgHtml = '';
        if (item.image && item.image.trim() !== "") {
            imgHtml = `<img src="${item.image}" class="w-full h-full object-cover" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                       <div class="hidden absolute inset-0 items-center justify-center bg-slate-100"><span class="text-5xl">${icon}</span></div>`;
        } else {
            imgHtml = `<div class="absolute inset-0 flex items-center justify-center bg-slate-100"><span class="text-5xl">${icon}</span></div>`;
        }

        card.innerHTML = `
            <div class="relative h-36 bg-gradient-to-br from-slate-100 to-slate-200">
                ${imgHtml}
                <span class="category-badge absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/90 backdrop-blur-sm text-slate-700 shadow-sm">
                    ${icon} ${displayCategory}
                </span>
            </div>
            <div class="p-4">
                <h3 class="font-bold text-slate-800 text-lg mb-1 truncate">${item.name}</h3>
                <p class="text-slate-500 text-sm flex items-center gap-1.5 mb-4">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
                    ${dimText}
                </p>
                ${noteHtml}
                <button onclick="deleteInfoItemB('${roomId}', ${realIndex})" class="w-full bg-red-50 hover:bg-red-100 text-red-600 py-2 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Delete
                </button>
            </div>
        `;
        listEl.appendChild(card);
    });
}

window.filterItems = function(category) {
    currentCategoryFilter = category;
    document.querySelectorAll('.category-filter').forEach(btn => {
        if (btn.dataset.cat === category) {
            btn.classList.add('active', 'bg-indigo-600', 'text-white', 'shadow-md');
            btn.classList.remove('bg-slate-100', 'text-slate-700');
        } else {
            btn.classList.remove('active', 'bg-indigo-600', 'text-white', 'shadow-md');
            btn.classList.add('bg-slate-100', 'text-slate-700');
        }
    });
    if (currentViewingRoom) renderRoomInfoListB(getRoomIdB(currentViewingRoom));
}

window.openRoomInfoModal = function(roomElement) {
    currentViewingRoom = roomElement;
    const roomId = getRoomIdB(roomElement);
    document.getElementById('infoRoomTitle').innerText = `Room ${roomId}`;
    document.getElementById('infoRoomIdDisplay').innerText = `#${roomId}`;
    renderCategoryFiltersB();
    filterItems('all');
    syncRoomInfoNotePanelStateB();
    setRoomInfoNoteModeB('view');
    toggleRoomInfoNotePanel(false);
    document.getElementById('roomInfoModal').classList.remove('hidden');
}

function setRoomInfoNoteModeB(mode) {
    const viewEl = document.getElementById('room-info-note-view');
    const editorEl = document.getElementById('room-info-note-editor');
    if (!viewEl || !editorEl) return;
    viewEl.classList.toggle('hidden', mode !== 'view');
    editorEl.classList.toggle('hidden', mode !== 'edit');
}

function syncRoomInfoNotePanelStateB() {
    const noteInput = document.getElementById('room-info-note-input');
    const noteText = document.getElementById('room-info-note-text');
    const noteSaveBtn = document.getElementById('room-info-note-save-btn');
    const noteEditBtn = document.getElementById('room-info-note-edit-btn');
    const isToday = selectedSnapshotDate === getTodayLocal();
    const noteValue = currentViewingRoom ? String(currentViewingRoom.getAttribute('data-room-note') || '').trim() : '';

    if (noteInput) {
        noteInput.value = noteValue;
        noteInput.disabled = !isToday;
    }
    if (noteText) {
        noteText.textContent = noteValue || 'ยังไม่มีโน้ตห้อง';
    }
    if (noteSaveBtn) noteSaveBtn.disabled = !isToday;
    if (noteEditBtn) noteEditBtn.disabled = !isToday;
}

window.toggleRoomInfoNotePanel = function(forceOpen) {
    const panel = document.getElementById('room-info-note-panel');
    if (!panel) return;
    if (typeof forceOpen === 'boolean') {
        panel.classList.toggle('hidden', !forceOpen);
        if (forceOpen) {
            syncRoomInfoNotePanelStateB();
            setRoomInfoNoteModeB('view');
        }
        return;
    }
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
        syncRoomInfoNotePanelStateB();
        setRoomInfoNoteModeB('view');
    }
}

window.enterRoomInfoNoteEdit = function() {
    if (selectedSnapshotDate !== getTodayLocal()) {
        alert("View only (past date).");
        return;
    }
    setRoomInfoNoteModeB('edit');
    const noteInput = document.getElementById('room-info-note-input');
    if (noteInput) noteInput.focus();
}

window.cancelRoomInfoNoteEdit = function() {
    syncRoomInfoNotePanelStateB();
    setRoomInfoNoteModeB('view');
}

window.saveRoomInfoNote = async function() {
    if (!currentViewingRoom) return;
    if (selectedSnapshotDate !== getTodayLocal()) {
        alert("View only (past date).");
        return;
    }
    const noteInput = document.getElementById('room-info-note-input');
    const note = noteInput ? String(noteInput.value || '').trim() : '';
    const roomId = getRoomIdB(currentViewingRoom);

    currentViewingRoom.setAttribute('data-room-note', note);

    let bedBadge = 'none';
    const badgeEl = currentViewingRoom.querySelector('.bed-badge');
    if (badgeEl) {
        if (badgeEl.classList.contains('bg-db')) bedBadge = 'db';
        else if (badgeEl.classList.contains('bg-triple')) bedBadge = 'triple';
    }

    const payload = {
        building: BUILDING_ID,
        room_id: roomId,
        guest_name: getGuestNameFromRoom(currentViewingRoom),
        room_type: getRoomTypeIdForRoom(currentViewingRoom),
        room_note: note,
        maint_status: String(currentViewingRoom.getAttribute('data-maint') || '').trim(),
        maint_note: String(currentViewingRoom.getAttribute('data-maint-note') || '').trim(),
        ap_installed: currentViewingRoom.getAttribute('data-ap') === 'true' ? 1 : 0,
        ap_install_date: String(currentViewingRoom.getAttribute('data-ap-date') || '').trim(),
        bed_badge: bedBadge
    };

    await apiRequest('save_room_state', payload);
    await apiRequest('save_room_snapshot', { ...payload, snapshot_date: getTodayLocal() });

    const map = loadRoomStateMapB();
    map[roomId] = { ...(map[roomId] || {}), roomNote: note, room_note: note };
    saveRoomStateMapB(map);
    syncRoomInfoNotePanelStateB();
    setRoomInfoNoteModeB('view');
};

window.closeInfoModal = function() {
    toggleRoomInfoNotePanel(false);
    document.getElementById('roomInfoModal').classList.add('hidden');
    currentViewingRoom = null;
}

window.openAddItemModal = function() {
    document.getElementById('addItemModal').classList.remove('hidden');
    renderCategorySelectOptionsB();
    document.getElementById('item-name-input').value = '';
    document.getElementById('item-width-input').value = '';
    document.getElementById('item-height-input').value = '';
    const noteInput = document.getElementById('item-note-input');
    if (noteInput) noteInput.value = '';
    const first = getItemCategories()[0];
    document.getElementById('item-category-input').value = first ? first.name : '';
    currentImageData = '';
    const fileInput = document.getElementById('item-image-file');
    if (fileInput) fileInput.value = '';
    updateImagePreview('');
}

window.closeAddItemModal = function() {
    document.getElementById('addItemModal').classList.add('hidden');
}

window.updateImagePreview = function(url) {
    const img = document.getElementById('preview-img');
    const placeholder = document.getElementById('image-placeholder');
    if (!img || !placeholder) return;
    if (url && url.trim() !== '') {
        img.src = url;
        img.classList.remove('hidden');
        placeholder.classList.add('hidden');
        img.onerror = () => { img.classList.add('hidden'); placeholder.classList.remove('hidden'); };
    } else {
        img.classList.add('hidden');
        placeholder.classList.remove('hidden');
    }
}

function initImagePickerB() {
    const dropzone = document.getElementById('image-dropzone');
    const fileInput = document.getElementById('item-image-file');
    const pickBtn = document.getElementById('image-pick-btn');
    if (!dropzone || !fileInput) return;

    const handleFile = (file) => {
        if (!file) return;
        if (!file.type || !file.type.startsWith('image/')) {
            alert('Please select an image file only.');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            currentImageData = String(reader.result || '');
            updateImagePreview(currentImageData);
        };
        reader.readAsDataURL(file);
    };

    fileInput.addEventListener('change', (e) => handleFile(e.target.files && e.target.files[0]));
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click();
        }
    });
    if (pickBtn) pickBtn.addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); });

    const setDragState = (on) => dropzone.classList.toggle('is-dragover', on);
    ['dragenter', 'dragover'].forEach(evt => {
        dropzone.addEventListener(evt, (e) => { e.preventDefault(); setDragState(true); });
    });
    ['dragleave', 'dragend'].forEach(evt => {
        dropzone.addEventListener(evt, () => setDragState(false));
    });
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        setDragState(false);
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        handleFile(file);
    });
}

window.saveCanvaItem = function() {
    if (!currentViewingRoom) return;
    if (selectedSnapshotDate !== getTodayLocal()) { alert("View only (past date)."); return; }
    const name = document.getElementById('item-name-input').value.trim();
    const width = document.getElementById('item-width-input').value.trim();
    const height = document.getElementById('item-height-input').value.trim();
    const note = (document.getElementById('item-note-input')?.value || '').trim();
    const image = currentImageData || '';
    const category = document.getElementById('item-category-input').value || (getItemCategories()[0]?.name || 'อื่นๆ');
    if (!name) { alert("Please enter an item name."); return; }

    const roomId = getRoomIdB(currentViewingRoom);
    const map = loadRoomInfoMapB();
    if (!map[roomId]) map[roomId] = [];
    map[roomId].push({ name, width, height, note, image, category });
    roomInfoMapCache = map;
    saveRoomInfoMapForRoom(roomId);

    closeAddItemModal();
    renderRoomInfoListB(roomId);
}

window.deleteInfoItemB = function(roomId, index) {
    if (selectedSnapshotDate !== getTodayLocal()) { alert("View only (past date)."); return; }
    if(!confirm("Confirm delete this item?")) return;
    const map = loadRoomInfoMapB();
    if (map[roomId]) {
        map[roomId].splice(index, 1);
        roomInfoMapCache = map;
        saveRoomInfoMapForRoom(roomId);
        renderRoomInfoListB(roomId);
    }
};

const DEFAULT_MAINT_CATS = [
    { name: 'WiFi Install / Network Repair', icon: '๐“ถ' },
    { name: 'Aircon Cleaning / Repair', icon: 'โ๏ธ' },
    { name: 'Housekeeping', icon: '๐งน' },
    { name: 'General Maintenance', icon: '๐”ง' }
];

function getMaintIconB(maintName) {
    const list = (() => {
        try { return JSON.parse(localStorage.getItem('maint_cats_final_v1')) || []; } catch { return []; }
    })();
    const found = list.find(c => c.name === maintName);
    if (found) return found.icon;
    const fallback = DEFAULT_MAINT_CATS.find(c => c.name === maintName);
    return fallback ? fallback.icon : null;
}

function getMaintColorByIcon(icon) {
    if (icon === '๐“ถ') return '#3b82f6';
    if (icon === 'โ๏ธ') return '#a855f7';
    if (icon === '๐งน') return '#ec4899';
    if (icon === '๐”ง') return '#f59e0b';
    return '#10b981';
}

function getDashboardRooms() {
    return Array.from(document.querySelectorAll('.room, .room-b'));
}

function applyRoomIconsB() {
    let anyMaint = false;
    document.querySelectorAll('.room-b').forEach(room => {
        room.querySelectorAll('.ap-badge, .maint-icon').forEach(el => el.remove());
        const apInstalled = room.getAttribute('data-ap') === 'true';
        if (apInstalled) {
            const apDate = room.getAttribute('data-ap-date') || '';
            const label = apDate ? `Installed: ${apDate}` : 'Installed: Unspecified';
            room.insertAdjacentHTML('beforeend', `<div class="ap-badge" data-info="${label}"><span class="ap-dot"></span></div>`);
        }
        const maintStatus = (room.getAttribute('data-maint') || '').trim();
        if (maintStatus) {
            anyMaint = true;
            const icon = getMaintIconB(maintStatus) || '๐”ง';
            const note = (room.getAttribute('data-maint-note') || '').trim();
            const label = note ? `Task: ${note}` : 'Task: Unspecified';
            room.insertAdjacentHTML('beforeend', `<div class="maint-icon" data-info="${label}">${icon}</div>`);
        }
    });
    if (anyMaint) document.body.classList.add('show-filter-icons');
}

function applyFiltersB() {
    const rooms = getRoomElementsB();
    document.body.classList.toggle('show-filter-icons', activeFilters.size > 0);
    rooms.forEach(room => {
        room.classList.remove('dimmed', 'room-active-highlight');
        room.querySelectorAll('.filter-icon, .maint-icon').forEach(el => el.remove());
    });

    if (activeFilters.size === 0) {
        applyRoomIconsB();
        return;
    }

    const categories = (() => {
        try { return JSON.parse(localStorage.getItem('maint_cats_final_v1')) || []; } catch { return []; }
    })();
    const iconMap = new Map(categories.map(c => [c.name.trim(), c.icon]));

    rooms.forEach(room => {
        const rawMaint = room.getAttribute('data-maint') || "";
        const cleanMaint = rawMaint.trim();
        const isMatch = activeFilters.has(cleanMaint) || activeFilters.has(rawMaint);
        if (!isMatch) return;

        const icon = iconMap.get(cleanMaint) || iconMap.get(rawMaint) || "๐”ง";
        room.insertAdjacentHTML('beforeend', `<span class="filter-icon" aria-hidden="true">${icon}</span>`);
        const note = (room.getAttribute('data-maint-note') || '').trim();
        const label = note ? `Task: ${note}` : 'Task: Unspecified';
        room.insertAdjacentHTML('beforeend', `<div class="maint-icon" data-info="${label}">${icon}</div>`);
    });
}

function toggleFilterB(filterName) {
    const target = filterName.trim();
    if (activeFilters.has(target)) activeFilters.delete(target); else activeFilters.add(target);
    applyFiltersB();
}

function renderServiceSidebarB() {
    const sidebarContainer = document.getElementById('service-sidebar-list');
    if (!sidebarContainer) return;
    const categories = JSON.parse(localStorage.getItem('maint_cats_final_v1')) || [];
    const allRooms = getRoomElementsB();
    sidebarContainer.innerHTML = '';

    categories.forEach(cat => {
        const count = Array.from(allRooms).filter(room => room.getAttribute('data-maint') === cat.name).length;
        let colorTheme = { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-500', badge: 'bg-slate-400' };

        if (cat.icon === '๐“ถ') colorTheme = { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', badge: 'bg-blue-600' };
        else if (cat.icon === 'โ๏ธ') colorTheme = { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-700', badge: 'bg-purple-600' };
        else if (cat.icon === '๐งน') colorTheme = { bg: 'bg-pink-50', border: 'border-pink-300', text: 'text-pink-700', badge: 'bg-pink-600' };
        else if (cat.icon === '๐”ง' || cat.icon === 'โก') colorTheme = { bg: 'bg-yellow-50', border: 'border-yellow-400', text: 'text-yellow-800', badge: 'bg-yellow-600' };

        if (activeFilters.has(cat.name.trim())) {
            colorTheme.bg = 'bg-orange-100'; colorTheme.border = 'border-orange-500'; colorTheme.text = 'text-orange-700'; colorTheme.badge = 'bg-orange-600';
        }

        const card = document.createElement('div');
        card.className = `filter-card-mini ${colorTheme.bg} ${colorTheme.border} ${colorTheme.text} p-4 rounded-2xl border-2 flex items-center justify-between transition-all duration-300 mb-3 shadow-sm hover:translate-x-1 cursor-pointer`;
        card.innerHTML = `<div class="flex items-center gap-4"><span class="text-3xl filter drop-shadow-sm">${cat.icon}</span><div class="flex flex-col text-left"><span class="text-[12px] font-extrabold uppercase tracking-tight text-slate-700">${cat.name}</span></div></div><div class="${colorTheme.badge} text-white text-lg font-black px-3 py-0.5 rounded-xl min-w-[35px] text-center shadow-inner">${count}</div>`;
        card.onclick = () => { toggleFilterB(cat.name.trim()); renderServiceSidebarB(); };
        sidebarContainer.appendChild(card);
    });
}

function getGuestNameFromRoom(room) {
    const dataName = (room.getAttribute('data-name') || '').trim();
    if (dataName) return dataName;
    const guestEl = room.querySelector('.guest-name, .r-guest, .guest-label');
    const guestText = guestEl ? guestEl.textContent.trim() : '';
    if (guestText) return guestText;
    const lines = room.innerText.split('\n').map(s => s.trim()).filter(Boolean);
    return lines.length >= 2 ? lines[1] : '';
}

function getMaintenanceCategories() {
    try {
        const list = JSON.parse(localStorage.getItem('maint_cats_final_v1')) || [];
        if (list.length) return list;
    } catch { }
    return DEFAULT_MAINT_CATS;
}

function getRoomTypeNameMap() {
    try {
        const list = JSON.parse(localStorage.getItem('room_types_final_v1')) || [];
        const map = new Map();
        list.forEach(item => map.set(item.id, item.name));
        return map;
    } catch {
        return new Map();
    }
}

function getRoomTypeColorById(typeId) {
    try {
        const list = JSON.parse(localStorage.getItem('room_types_final_v1')) || [];
        const match = list.find(item => item.id === typeId);
        return match ? match.color : null;
    } catch {
        return null;
    }
}

function getRoomTypeIdForRoom(room) {
    const explicit = room.getAttribute('data-type');
    if (explicit) return explicit;
    const cls = Array.from(room.classList).find(c => c.startsWith('type-'));
    return cls || 'type-unknown';
}

function getRoomTypeColor(typeId) {
    if (ROOM_COLORS[typeId]) return ROOM_COLORS[typeId];
    const fromStore = getRoomTypeColorById(typeId);
    return fromStore || '';
}

function updateDashboardCharts() {
    const rooms = getDashboardRooms();
    const totalRooms = rooms.length;
    const occupied = rooms.filter(r => getGuestNameFromRoom(r)).length;
    const vacant = Math.max(0, totalRooms - occupied);

    const apInstalled = rooms.filter(r => r.getAttribute('data-ap') === 'true').length;
    const apPercent = totalRooms ? Math.round((apInstalled / totalRooms) * 100) : 0;

    const apBar = document.getElementById('apProgressBar');
    const apPercentEl = document.getElementById('apProgressPercent');
    const apCountEl = document.getElementById('apProgressCount');
    if (apBar) apBar.style.width = `${apPercent}%`;
    if (apPercentEl) apPercentEl.textContent = `${apPercent}%`;
    if (apCountEl) apCountEl.textContent = `${apInstalled} / ${totalRooms} rooms`;

    if (typeof Chart === 'undefined') return;

    const occupancyCanvas = document.getElementById('occupancyChart');
    if (occupancyCanvas) {
        if (occupancyChart) occupancyChart.destroy();
        occupancyChart = new Chart(occupancyCanvas, {
            type: 'doughnut',
            data: {
                labels: ['Occupied', 'Vacant'],
                datasets: [{
                    data: [occupied, vacant],
                    backgroundColor: ['#7c3aed', '#e2e8f0'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }

    const maintCanvas = document.getElementById('maintenanceChart');
    if (maintCanvas) {
        const cats = getMaintenanceCategories();
        const countMap = new Map();
        cats.forEach(c => countMap.set(c.name, { count: 0, icon: c.icon }));

        rooms.forEach(r => {
            const maint = (r.getAttribute('data-maint') || '').trim();
            if (!maint) return;
            if (!countMap.has(maint)) countMap.set(maint, { count: 0, icon: '๐”ง' });
            const entry = countMap.get(maint);
            entry.count += 1;
        });

        const labels = [];
        const data = [];
        const colors = [];
        Array.from(countMap.entries()).forEach(([name, meta]) => {
            labels.push(`${meta.icon} ${name}`);
            data.push(meta.count);
            colors.push(getMaintColorByIcon(meta.icon));
        });

        if (maintenanceChart) maintenanceChart.destroy();
        maintenanceChart = new Chart(maintCanvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Rooms',
                    data,
                    backgroundColor: colors,
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, ticks: { precision: 0 } },
                    x: { ticks: { autoSkip: false } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    const tableWrap = document.getElementById('roomTypeSummary');
    if (tableWrap) {
        const typeNameMap = getRoomTypeNameMap();
        const typeBuckets = new Map();
        rooms.forEach(room => {
            const typeId = getRoomTypeIdForRoom(room);
            const count = typeBuckets.get(typeId) || 0;
            typeBuckets.set(typeId, count + 1);
        });

        const orderedIds = [];
        try {
            const list = JSON.parse(localStorage.getItem('room_types_final_v1')) || [];
            list.forEach(item => { if (item.id) orderedIds.push(item.id); });
        } catch { }
        typeBuckets.forEach((_, key) => { if (!orderedIds.includes(key)) orderedIds.push(key); });

        const rows = orderedIds.map(id => {
            const name = typeNameMap.get(id) || id.replace(/^type-/, '').toUpperCase();
            const count = typeBuckets.get(id) || 0;
            const color = getRoomTypeColor(id);
            return `
                <tr>
                    <td><span class="dashboard-table__color" style="background:${color}"></span>${name}</td>
                    <td>${count}</td>
                </tr>
            `;
        }).join('');

        tableWrap.innerHTML = `
            <table class="dashboard-table">
                <thead>
                    <tr>
                        <th>Room Type</th>
                        <th>Rooms</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }
}

function initDashboardSummaryB() {
    const btn = document.getElementById('dashboardBtn');
    const modal = document.getElementById('dashboardModal');
    const closeBtn = document.getElementById('dashboardClose');
    const printBtn = document.getElementById('dashboardPrint');
    const content = document.getElementById('dashboardContent');
    if (!btn || !modal || !content) return;

    function getRoomNumberB(room) {
        return room.querySelector('.r-num')?.innerText?.trim() || "0000";
    }

    function getRoomTypeIdB(room) {
        const cls = Array.from(room.classList).find(c => c.startsWith('type-'));
        return cls || 'type-unknown';
    }

    btn.addEventListener('click', () => {
        modal.classList.remove('hidden');
        updateDashboardCharts();
    });

    if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
    if (printBtn) printBtn.addEventListener('click', () => {
        prepareReportPrint();
        window.print();
    });

    function getPrintPageSizePx() {
        let sizer = document.getElementById('print-page-sizer');
        if (!sizer) {
            sizer = document.createElement('div');
            sizer.id = 'print-page-sizer';
            sizer.style.position = 'fixed';
            sizer.style.left = '0';
            sizer.style.top = '0';
            sizer.style.width = '210mm';
            sizer.style.height = '297mm';
            sizer.style.visibility = 'hidden';
            sizer.style.pointerEvents = 'none';
            document.body.appendChild(sizer);
        }
        const rect = sizer.getBoundingClientRect();
        return { pageW: rect.width, pageH: rect.height, printableW: rect.width, printableH: rect.height };
    }

    function scalePlanForPrintPortrait() {
        const plan = document.querySelector('.building') || document.querySelector('.building-b-wrapper');
        if (!plan) return;
        const { pageW, pageH, printableW, printableH } = getPrintPageSizePx();
        const rect = plan.getBoundingClientRect();
        const style = window.getComputedStyle(plan);
        const marginX = (parseFloat(style.marginLeft) || 0) + (parseFloat(style.marginRight) || 0);
        const marginY = (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
        const planWidth = (plan.scrollWidth || rect.width) + marginX;
        const planHeight = (plan.scrollHeight || rect.height) + marginY;
        if (!printableW || !printableH || !planWidth || !planHeight) return;
        const scaleX = printableW / planHeight;
        const scaleY = printableH / planWidth;
        const scale = Math.min(1, scaleX, scaleY) * 0.88;
        const scaledW = planHeight * scale;
        const scaledH = planWidth * scale;
        const extraShiftX = 240;
        const translateX = (printableW - scaledW) / 2 + extraShiftX;
        const translateY = (printableH - scaledH) / 2 + scaledH;
        document.body.style.setProperty('--print-page-w', `${pageW.toFixed(2)}px`);
        document.body.style.setProperty('--print-page-h', `${pageH.toFixed(2)}px`);
        document.body.style.setProperty('--print-rotate-scale', scale.toFixed(4));
        document.body.style.setProperty('--print-rotate-tx', `${translateX.toFixed(2)}px`);
        document.body.style.setProperty('--print-rotate-ty', `${translateY.toFixed(2)}px`);
    }

    function prepareReportPrint() {
        document.body.classList.add('print-report');
        modal.classList.remove('hidden');
        scalePlanForPrintPortrait();
        updateDashboardCharts();
        if (occupancyChart) occupancyChart.resize();
        if (maintenanceChart) maintenanceChart.resize();
    }

    window.addEventListener('beforeprint', () => {
        prepareReportPrint();
    });

    window.addEventListener('afterprint', () => {
        document.body.style.setProperty('--print-page-w', '');
        document.body.style.setProperty('--print-page-h', '');
        document.body.style.setProperty('--print-rotate-scale', '1');
        document.body.style.setProperty('--print-rotate-tx', '0px');
        document.body.style.setProperty('--print-rotate-ty', '0px');
        document.body.classList.remove('print-report');
    });
}

