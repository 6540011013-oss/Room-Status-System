/* =========================================================
   Room Status System - Building A (CANVA EXACT STYLE V2)
   - แก้ไขให้ปุ่มกดทำงานได้จริงกับ HTML ชุดใหม่
========================================================= */

let currentEditingRoom = null;
let currentViewingRoom = null;
let activeFilters = new Set(); 
let currentCategoryFilter = 'all';
let currentImageData = '';
let imageViewerLastActive = null;
let maintenanceChart = null;
const BUILDING_ID = String(document.body?.dataset?.buildingId || 'A').trim().toUpperCase();
const API_URL = 'api.php';
const DATE_STORAGE_KEY = `room_snapshot_date_${BUILDING_ID.toLowerCase()}_v1`;
let maintTaskLogCache = [];

async function loadMaintenanceTasksFromDb() {
    const res = await apiRequest('get_maintenance_tasks', { building: BUILDING_ID });
    if (res && Array.isArray(res.tasks)) {
        maintTaskLogCache = res.tasks.map(task => ({
            ...task,
            id: task?.id ?? null,
            roomId: String(task?.roomId ?? task?.room_id ?? '').trim(),
            type: String(task?.type ?? '').trim(),
            note: String(task?.note ?? '').trim(),
            reportedDate: String(task?.reportedDate ?? task?.reported_date ?? '').trim(),
            resolvedDate: String(task?.resolvedDate ?? task?.resolved_date ?? '').trim(),
            status: String(task?.status ?? 'pending').trim()
        }));
    } else {
        maintTaskLogCache = [];
    }
    if (typeof renderResolvedThumbs === 'function') {
        renderResolvedThumbs();
    }
    return maintTaskLogCache;
}

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
// Convenience safe-get helper
function el(id) { return document.getElementById(id) || null; }
async function syncRoomTypesFromDb() {
    const res = await apiRequest('get_room_types');
    if (res && Array.isArray(res.room_types)) {
        localStorage.setItem('room_types_final_v1', JSON.stringify(res.room_types));
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
if (selectedSnapshotDate !== getTodayLocal()) {
    // Default to today on new page load to avoid showing stale snapshots by accident.
    selectedSnapshotDate = getTodayLocal();
    localStorage.setItem(DATE_STORAGE_KEY, selectedSnapshotDate);
}

// สีห้อง (ดึงจาก SQL เท่านั้น)
const ROOM_COLORS = {};

const DEFAULT_ITEM_CATEGORIES = [
    { name: 'เฟอร์นิเจอร์', label: 'Furniture', icon: '🛋️', sort_order: 10 },
    { name: 'เครื่องใช้ไฟฟ้า', label: 'Appliances', icon: '💡', sort_order: 20 },
    { name: 'ของตกแต่ง', label: 'Decor', icon: '🖼️', sort_order: 30 },
    { name: 'อื่นๆ', label: 'Other', icon: '📦', sort_order: 40 }
];
let itemCategories = [...DEFAULT_ITEM_CATEGORIES];

const ALL_COLOR_CLASSES = Object.keys(ROOM_COLORS);

function normalizeCategoryName(raw) {
    return String(raw || '').trim();
}

function getItemCategories() {
    if (!Array.isArray(itemCategories) || !itemCategories.length) {
        return DEFAULT_ITEM_CATEGORIES;
    }
    return itemCategories;
}

function getCategoryMeta(name) {
    const key = normalizeCategoryName(name);
    const found = getItemCategories().find(c => normalizeCategoryName(c.name) === key);
    if (found) return found;
    return { name: key || 'อื่นๆ', label: key || 'Other', icon: '📦' };
}

async function syncItemCategoriesFromDb() {
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
    renderCategoryFilters();
    renderCategorySelectOptions();
}

function renderCategoryFilters() {
    const wrap = el('category-filters');
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

function renderCategorySelectOptions() {
    const select = el('item-category-input');
    if (!select) return;
    const options = getItemCategories().map(cat => `<option value="${cat.name}">${cat.icon} ${cat.label}</option>`);
    select.innerHTML = options.join('');
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
    await syncItemCategoriesFromDb();
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
    await syncItemCategoriesFromDb();
};

function getRoomTypeColorById(typeId) {
    try {
        const list = JSON.parse(localStorage.getItem('room_types_final_v1')) || [];
        const match = list.find(item => item.id === typeId);
        return match ? match.color : null;
    } catch {
        return null;
    }
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

function getRoomElements() { return Array.from(document.querySelectorAll('.room:not(.two-line)')); }
function getRoomNumber(el) { return el.innerText.split('\n')[0] || "0000"; }
function getRoomId(roomElement) { return (roomElement.getAttribute('data-room-id') || getRoomNumber(roomElement)).trim(); }
function getRoomImage(roomElement) { return String(roomElement?.getAttribute('data-room-image') || '').trim(); }

// --- STORAGE (Items in Room) ---
let roomInfoMapCache = {};
const roomItemsSaveQueue = new Map();

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

function loadRoomInfoMap() {
    return roomInfoMapCache;
}

async function saveRoomInfoMapForRoom(roomId) {
    const items = roomInfoMapCache[roomId] || [];
    const res = await apiRequest('save_room_items_snapshot', {
        building: BUILDING_ID,
        room_id: roomId,
        snapshot_date: selectedSnapshotDate,
        items_json: JSON.stringify(items)
    });
    return !!(res && res.ok === true);
}

function queueSaveRoomInfoMapForRoom(roomId) {
    const key = String(roomId || '').trim();
    if (!key) return Promise.resolve(false);

    const prev = roomItemsSaveQueue.get(key) || Promise.resolve(true);
    const next = prev
        .catch(() => false)
        .then(() => saveRoomInfoMapForRoom(key));

    roomItemsSaveQueue.set(key, next);
    next.finally(() => {
        if (roomItemsSaveQueue.get(key) === next) {
            roomItemsSaveQueue.delete(key);
        }
    });
    return next;
}

const ROOM_STATE_KEY = 'room_state_a_v1';
function loadRoomStateMap() {
    try { return JSON.parse(localStorage.getItem(ROOM_STATE_KEY)) || {}; }
    catch { return {}; }
}
function saveRoomStateMap(map) { localStorage.setItem(ROOM_STATE_KEY, JSON.stringify(map)); }
function persistRoomState(roomElement, data) {
    const roomId = getRoomId(roomElement);
    const map = loadRoomStateMap();
    map[roomId] = data;
    saveRoomStateMap(map);
    saveRoomStateToDb(roomId, data);
    saveRoomSnapshotToDb(roomId, data);
}

function clearRoomTypeColors() {
    getRoomElements().forEach(room => {
        Array.from(room.classList).forEach(c => {
            if (c.startsWith('type-')) room.classList.remove(c);
        });
        room.style.setProperty('background-color', 'transparent', 'important');
        room.style.setProperty('border-color', '#e2e8f0', 'important');
    });
}

async function saveRoomStateToDb(roomId, data) {
    await apiRequest('save_room_state', {
        building: BUILDING_ID,
        room_id: roomId,
        guest_name: data.name || '',
        room_type: data.typeClass || '',
        room_note: data.roomNote || '',
        maint_status: data.maintStatus || '',
        maint_note: data.maintNote || '',
        ap_installed: data.apChecked ? 1 : 0,
        ap_install_date: data.apDate || '',
        bed_badge: '',
        room_image: data.roomImage || data.room_image || ''
    });
}

async function saveRoomSnapshotToDb(roomId, data) {
    await apiRequest('save_room_snapshot', {
        building: BUILDING_ID,
        room_id: roomId,
        snapshot_date: selectedSnapshotDate,
        guest_name: data.name || '',
        room_type: data.typeClass || '',
        room_note: data.roomNote || '',
        maint_status: data.maintStatus || '',
        maint_note: data.maintNote || '',
        ap_installed: data.apChecked ? 1 : 0,
        ap_install_date: data.apDate || '',
        bed_badge: '',
        room_image: data.roomImage || data.room_image || ''
    });
}

// --- RENDER ITEMS (Canva Style Grid) ---
function renderRoomInfoList(roomId) {
    const listEl = document.getElementById('items-grid');
    const emptyState = document.getElementById('empty-state');
    const countBadge = document.getElementById('itemCount');
    
    if (!listEl) return;

    const map = loadRoomInfoMap();
    let items = map[roomId] || [];
    const roomDefaultImage = currentViewingRoom ? getRoomImage(currentViewingRoom) : '';

    // Update count (all items)
    if(countBadge) countBadge.innerText = items.length;

    // Filter
    if (currentCategoryFilter !== 'all') {
        items = items.filter(item => item.category === currentCategoryFilter);
    }

    listEl.innerHTML = '';

    if (!items.length) {
        listEl.classList.add('hidden');
        if(emptyState) emptyState.classList.remove('hidden');
        return;
    }

    listEl.classList.remove('hidden');
    if(emptyState) emptyState.classList.add('hidden');

    items.forEach((item, index) => {
        // หา index จริง
        const realIndex = (map[roomId] || []).indexOf(item);
       const category = item.category || 'อื่นๆ';
        const categoryMeta = getCategoryMeta(category);
        const displayCategory = categoryMeta.label;
        const icon = categoryMeta.icon;
        
        // ลบ cm ตรงบรรทัดนี้ออกแล้ว
        const dimText = (item.width || item.height) ? `${item.width || '-'} × ${item.height || '-'}` : 'Size not specified';
        
        const noteText = String(item.note || '').trim();
        const noteHtml = noteText
            ? `<p class="text-slate-600 text-sm mb-4 break-words">${noteText}</p>`
            : '';

        const card = document.createElement('div');
        card.className = 'item-card bg-white rounded-2xl overflow-hidden shadow-lg border border-slate-100 cursor-pointer';
        
        // รูปภาพ
        let imgHtml = '';
        const itemImage = (item.image && item.image.trim() !== '') ? item.image : roomDefaultImage;
        if (itemImage && itemImage.trim() !== "") {
            imgHtml = `<img src="${itemImage}" class="w-full h-full object-cover" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                       <div class="hidden absolute inset-0 items-center justify-center bg-slate-100"><span class="text-5xl">${icon}</span></div>`;
        } else {
            imgHtml = `<div class="absolute inset-0 flex items-center justify-center bg-slate-100"><span class="text-5xl">${icon}</span></div>`;
        }

        card.innerHTML = `
            <button type="button" class="item-preview-trigger relative h-36 w-full bg-gradient-to-br from-slate-100 to-slate-200 border-none p-0">
                ${imgHtml}
                <span class="category-badge absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/90 backdrop-blur-sm text-slate-700 shadow-sm">
                    ${icon} ${displayCategory}
                </span>
            </button>
            <div class="p-4">
                <h3 class="font-bold text-slate-800 text-lg mb-1 truncate">${item.name}</h3>
                <p class="text-slate-500 text-sm flex items-center gap-1.5 mb-4">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
                    ${dimText}
                </p>
                ${noteHtml}
                <button onclick="deleteInfoItem('${roomId}', ${realIndex})" class="w-full bg-red-50 hover:bg-red-100 text-red-600 py-2 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Delete
                </button>
            </div>
        `;
        const previewBtn = card.querySelector('.item-preview-trigger');
        if (previewBtn) {
            if (itemImage && itemImage.trim() !== '') {
                previewBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    openImageViewer(itemImage, item.name || `Room ${roomId}`);
                });
            } else {
                previewBtn.disabled = true;
                previewBtn.classList.remove('item-preview-trigger');
                previewBtn.style.cursor = 'default';
            }
        }
        listEl.appendChild(card);
    });
}

// --- FILTER ---
window.filterItems = function(category) {
    currentCategoryFilter = category;
    
    document.querySelectorAll('.category-filter').forEach(btn => {
        if(btn.dataset.cat === category) {
            btn.classList.add('active', 'bg-indigo-600', 'text-white', 'shadow-md');
            btn.classList.remove('bg-slate-100', 'text-slate-700');
        } else {
            btn.classList.remove('active', 'bg-indigo-600', 'text-white', 'shadow-md');
            btn.classList.add('bg-slate-100', 'text-slate-700');
        }
    });

    if (currentViewingRoom) {
        renderRoomInfoList(getRoomId(currentViewingRoom));
    }
}

// --- MODAL CONTROLS ---
window.openRoomInfoModal = function(roomElement) {
    currentViewingRoom = roomElement;
    const roomId = getRoomId(roomElement);
    
    document.getElementById('infoRoomTitle').innerText = `Room ${roomId}`;
    document.getElementById('infoRoomIdDisplay').innerText = `#${roomId}`;
    
    // Reset filter
    renderCategoryFilters();
    filterItems('all');

    syncRoomInfoNotePanelState();
    setRoomInfoNoteMode('view');
    toggleRoomInfoNotePanel(false);
    
    document.getElementById('roomInfoModal').classList.remove('hidden');
}

function setRoomInfoNoteMode(mode) {
    const viewEl = el('room-info-note-view');
    const editorEl = el('room-info-note-editor');
    if (!viewEl || !editorEl) return;
    viewEl.classList.toggle('hidden', mode !== 'view');
    editorEl.classList.toggle('hidden', mode !== 'edit');
}

function syncRoomInfoNotePanelState() {
    const noteInput = el('room-info-note-input');
    const noteText = el('room-info-note-text');
    const noteSaveBtn = el('room-info-note-save-btn');
    const noteEditBtn = el('room-info-note-edit-btn');
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
    const panel = el('room-info-note-panel');
    if (!panel) return;
    if (typeof forceOpen === 'boolean') {
        panel.classList.toggle('hidden', !forceOpen);
        if (forceOpen) {
            syncRoomInfoNotePanelState();
            setRoomInfoNoteMode('view');
        }
        return;
    }
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
        syncRoomInfoNotePanelState();
        setRoomInfoNoteMode('view');
    }
}

window.enterRoomInfoNoteEdit = function() {
    if (selectedSnapshotDate !== getTodayLocal()) {
        alert("View only (past date).");
        return;
    }
    setRoomInfoNoteMode('edit');
    const noteInput = el('room-info-note-input');
    if (noteInput) noteInput.focus();
}

window.cancelRoomInfoNoteEdit = function() {
    syncRoomInfoNotePanelState();
    setRoomInfoNoteMode('view');
}

window.saveRoomInfoNote = async function() {
    if (!currentViewingRoom) return;
    if (selectedSnapshotDate !== getTodayLocal()) {
        alert("View only (past date).");
        return;
    }
    const noteInput = el('room-info-note-input');
    const note = noteInput ? String(noteInput.value || '').trim() : '';
    const roomId = getRoomId(currentViewingRoom);

    currentViewingRoom.setAttribute('data-room-note', note);

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
        bed_badge: '',
        room_image: getRoomImage(currentViewingRoom)
    };

    await apiRequest('save_room_state', payload);
    await apiRequest('save_room_snapshot', { ...payload, snapshot_date: getTodayLocal() });

    const map = loadRoomStateMap();
    map[roomId] = { ...(map[roomId] || {}), roomNote: note, room_note: note };
    saveRoomStateMap(map);
    syncRoomInfoNotePanelState();
    setRoomInfoNoteMode('view');
};

window.closeInfoModal = function() {
    toggleRoomInfoNotePanel(false);
    document.getElementById('roomInfoModal').classList.add('hidden');
    currentViewingRoom = null;
}

window.openImageViewer = function(src, caption = '') {
    const modal = el('imageViewerModal');
    const img = el('imageViewerImg');
    const captionEl = el('imageViewerCaption');
    if (!modal || !img) return;
    const imageSrc = String(src || '').trim();
    if (!imageSrc) return;

    imageViewerLastActive = document.activeElement;
    img.src = imageSrc;
    if (captionEl) captionEl.textContent = String(caption || '').trim();
    modal.classList.remove('hidden');
};

window.closeImageViewer = function() {
    const modal = el('imageViewerModal');
    const img = el('imageViewerImg');
    const captionEl = el('imageViewerCaption');
    if (!modal) return;

    modal.classList.add('hidden');
    if (img) img.src = '';
    if (captionEl) captionEl.textContent = '';
    if (imageViewerLastActive && typeof imageViewerLastActive.focus === 'function') {
        imageViewerLastActive.focus();
    }
    imageViewerLastActive = null;
};

function initImageViewer() {
    const modal = el('imageViewerModal');
    if (!modal || modal.dataset.viewerReady === '1') return;

    modal.addEventListener('click', (e) => {
        if (e.target && e.target.closest('[data-image-viewer-close]')) {
            closeImageViewer();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeImageViewer();
        }
    });

    modal.dataset.viewerReady = '1';
}

window.openAddItemModal = function() {
    const modal = el('addItemModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    renderCategorySelectOptions();
    // Clear Form safely
    const nameIn = el('item-name-input'); if (nameIn) nameIn.value = '';
    const wIn = el('item-width-input'); if (wIn) wIn.value = '';
    const hIn = el('item-height-input'); if (hIn) hIn.value = '';
    const noteIn = el('item-note-input'); if (noteIn) noteIn.value = '';
    const catIn = el('item-category-input');
    if (catIn) {
        const first = getItemCategories()[0];
        catIn.value = first ? first.name : '';
    }
    currentImageData = '';
    const fileInput = el('item-image-file'); if (fileInput) fileInput.value = '';
    if (typeof window.updateImagePreview === 'function') window.updateImagePreview(currentImageData);
}

window.closeAddItemModal = function() {
    document.getElementById('addItemModal').classList.add('hidden');
}

window.updateImagePreview = function(url) {
    const img = el('preview-img');
    const placeholder = el('image-placeholder');
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

const DEFAULT_MAINT_CATS = [
    { name: 'WiFi Install / Network Repair', icon: '📶' },
    { name: 'Aircon Cleaning / Repair', icon: '❄️' },
    { name: 'Housekeeping', icon: '🧹' },
    { name: 'General Maintenance', icon: '🔧' }
];

function getMaintColorByIcon(icon) {
    if (icon === '📶') return '#3b82f6';
    if (icon === '❄️') return '#a855f7';
    if (icon === '🧹') return '#ec4899';
    if (icon === '🔧') return '#f59e0b';
    return '#10b981';
}

function getDashboardRooms() {
    return Array.from(document.querySelectorAll('.room, .room-b'));
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
    return [];
}

function getMaintIconByName(maintName) {
    const list = getMaintenanceCategories();
    const found = list.find(c => c.name === maintName);
    return found ? found.icon : null;
}

function readMaintTaskLog() {
    return Array.isArray(maintTaskLogCache) ? maintTaskLogCache : [];
}

function getTaskStateOnDate(task, dateISO, todayISO) {
    const reportedDate = String(task?.reportedDate || '').trim();
    const resolvedDate = String(task?.resolvedDate || '').trim();
    const status = String(task?.status || 'pending').trim();
    if (!reportedDate || !dateISO) return null;
    if (dateISO < reportedDate) return null;

    if (status === 'pending') {
        return (dateISO <= todayISO) ? 'pending' : null;
    }

    if (status === 'resolved') {
        if (!resolvedDate) return (dateISO <= todayISO) ? 'pending' : null;
        if (dateISO < resolvedDate) return 'pending';
        return 'resolved';
    }

    return null;
}

function getMaintenanceSnapshotStats() {
    const todayISO = getTodayLocal();
    const log = readMaintTaskLog();
    const pendingByType = new Map();
    const resolvedByType = new Map();
    const resolvedRoomIds = new Set();

    log.forEach(task => {
        const type = String(task?.type || '').trim();
        const roomId = String(task?.roomId || '').trim();
        if (!type || !roomId) return;

        const state = getTaskStateOnDate(task, selectedSnapshotDate, todayISO);
        if (!state) return;

        if (state === 'pending') {
            pendingByType.set(type, (pendingByType.get(type) || 0) + 1);
            return;
        }

        resolvedByType.set(type, (resolvedByType.get(type) || 0) + 1);
        resolvedRoomIds.add(roomId);
    });

    return { pendingByType, resolvedByType, resolvedRoomIds };
}

function getLatestResolvedRoomIds() {
    const log = readMaintTaskLog();
    const latestByRoom = new Map();

    log.forEach(task => {
        const roomId = String(task?.roomId || '').trim();
        if (!roomId || latestByRoom.has(roomId)) return;
        latestByRoom.set(roomId, String(task?.status || '').trim().toLowerCase() === 'resolved');
    });

    const resolvedRoomIds = new Set();
    latestByRoom.forEach((isResolved, roomId) => {
        if (isResolved) resolvedRoomIds.add(roomId);
    });
    return resolvedRoomIds;
}

function renderResolvedThumbs() {
    const resolvedRoomIds = getLatestResolvedRoomIds();
    const rooms = getRoomElements();
    rooms.forEach(room => {
        room.querySelectorAll('.resolved-thumb').forEach(el => el.remove());
        const roomId = String(getRoomId(room) || '').trim();
        if (!roomId || !resolvedRoomIds.has(roomId)) return;
        room.insertAdjacentHTML('beforeend', '<div class="resolved-thumb" title="Resolved">👍</div>');
    });
}

window.resolveMaintTaskFromDashboard = function(taskId) {
    if (!taskId) return;
    if (selectedSnapshotDate !== getTodayLocal()) {
        alert("View only (past date).");
        return;
    }

    if (!confirm('Mark this maintenance task as resolved?')) return;

    (async () => {
        const res = await apiRequest('resolve_maintenance_task', {
            building: BUILDING_ID,
            task_id: taskId
        });
        if (!res) return;

        await applyRoomStatesFromDb();
        await loadMaintenanceTasksFromDb();
        if (typeof renderServiceSidebar === 'function') renderServiceSidebar();
        if (typeof window.updateDashboardCharts === 'function') window.updateDashboardCharts();
    })();
};

window.updateDashboardCharts = function() {
    const rooms = getDashboardRooms();
    const maintStats = getMaintenanceSnapshotStats();

    // 1. นับจำนวน AP
    const apInstalled = rooms.filter(r => r.getAttribute('data-ap') === 'true').length;

    // ==========================================
    // ส่วนสร้างการ์ด DYNAMIC SUMMARY ROW
    // ==========================================
    const summaryRow = document.getElementById('dynamicSummaryRow');
    if (summaryRow) {
        summaryRow.innerHTML = ''; // เคลียร์ของเก่าก่อน

        // การ์ดใบที่ 1: ติดตั้ง AP (ยืนพื้นไว้เสมอ)
       summaryRow.innerHTML += `
            <div class="sum-card">
                <div class="sum-card-body">
                    <div class="sum-title">
                        <div style="width: 20px; height: 20px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.12); display: flex; align-items: center; justify-content: center;">
                            <div style="width: 12px; height: 12px; border-radius: 50%; border: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: center;">
                                <div style="width: 4px; height: 4px; border-radius: 50%; background: #3b82f6; box-shadow: 0 0 6px rgba(59,130,246,0.8);"></div>
                            </div>
                        </div>
                        AP Installed
                    </div>
                    <div class="sum-value" style="color: #3b82f6;">${apInstalled}</div>
                </div>
                <div class="sum-footer" style="background-color: #3b82f6;">Installed Units</div>
            </div>
        `;

        // การ์ดใบที่ 2 เป็นต้นไป: ลูปสร้างตาม Service Status (Maintenance Categories) ที่มีในระบบ
        const maintCategories = getMaintenanceCategories(); 
        
        // ชุดสีสำหรับให้การ์ดแต่ละใบสีไม่ซ้ำกัน
        const colors = ['#f59e0b', '#ec4899', '#8b5cf6', '#10b981', '#ef4444', '#14b8a6', '#f97316'];

        maintCategories.forEach((cat, index) => {
            const count = maintStats.pendingByType.get(cat.name) || 0;
            
            // เลือกสีตาม Index
            const color = colors[index % colors.length];

            // สร้างการ์ดและยัดลงไป
            summaryRow.innerHTML += `
                <div class="sum-card">
                    <div class="sum-card-body">
                        <div class="sum-title"><span class="text-xl">${cat.icon}</span> ${cat.name}</div>
                        <div class="sum-value" style="color: ${color};">${count}</div>
                    </div>
                    <div class="sum-footer" style="background-color: ${color};">Active Rooms</div>
                </div>
            `;
        });
    }

    // ==========================================
    // Maintenance Compare Chart (Pending vs Resolved)
    // ==========================================
    if (typeof Chart === 'undefined') return;

    const maintCanvas = document.getElementById('maintenanceCompareChart');
    if (maintCanvas) {
        const cats = getMaintenanceCategories();
        const countMap = new Map();
        cats.forEach(c => countMap.set(c.name, { pending: 0, resolved: 0, icon: c.icon }));
        maintStats.pendingByType.forEach((count, maint) => {
            if (!countMap.has(maint)) countMap.set(maint, { pending: 0, resolved: 0, icon: '🔧' });
            const entry = countMap.get(maint);
            entry.pending = count;
        });
        maintStats.resolvedByType.forEach((count, maint) => {
            if (!countMap.has(maint)) countMap.set(maint, { pending: 0, resolved: 0, icon: '🔧' });
            const entry = countMap.get(maint);
            entry.resolved = count;
        });

        const labels = [];
        const pendingData = [];
        const resolvedData = [];
        Array.from(countMap.entries()).forEach(([name, meta]) => {
            labels.push(`${meta.icon} ${name}`);
            pendingData.push(meta.pending || 0);
            resolvedData.push(meta.resolved || 0);
        });

        if (maintenanceChart) maintenanceChart.destroy();
        maintenanceChart = new Chart(maintCanvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Pending',
                    data: pendingData,
                    backgroundColor: '#f59e0b',
                    borderRadius: 8
                }, {
                    label: 'Resolved',
                    data: resolvedData,
                    backgroundColor: '#10b981',
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, ticks: { precision: 0 }, grace: '5%' },
                    x: { ticks: { autoSkip: false } }
                },
                plugins: {
                    legend: { display: true, position: 'bottom' }
                }
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
    // ==========================================
    // 🔥 สร้างตารางรายการซ่อมบำรุง (Maintenance Task List)
    // ==========================================
    const maintTableBody = document.getElementById('maintTaskTableBody');
    const maintTaskCountBadge = document.getElementById('maintTaskCount');

    if (maintTableBody) {
        const todayISO = getTodayLocal();
        maintTableBody.innerHTML = '';
        let taskCount = 0;
        const maintLog = [...readMaintTaskLog()];
        maintLog.sort((a, b) => String(b.reported_date || b.reportedDate || '').localeCompare(String(a.reported_date || a.reportedDate || '')));

        maintLog.forEach(task => {
            const reportedDate = task.reported_date || task.reportedDate || '';
            const resolvedDate = task.resolved_date || task.resolvedDate || '';
            const status = task.status || 'pending';

            // Rule 1: selectedSnapshotDate < reportedDate -> hide
            if (selectedSnapshotDate < reportedDate) return;

            let displayState = null; // 'pending' | 'resolved'

            if (status === 'pending') {
                // Rule 2: pending shows from reportedDate to current date
                if (selectedSnapshotDate >= reportedDate && selectedSnapshotDate <= todayISO) {
                    displayState = 'pending';
                }
            } else if (status === 'resolved') {
                // Rule 3A: show resolved only on resolvedDate
                if (selectedSnapshotDate === resolvedDate) {
                    displayState = 'resolved';
                }
                // Rule 3B: between reportedDate and before resolvedDate => pending
                else if (selectedSnapshotDate >= reportedDate && selectedSnapshotDate < resolvedDate) {
                    displayState = 'pending';
                }
                // Rule 3C: selectedSnapshotDate > resolvedDate => hide
            }

            if (!displayState) return;

            taskCount++;

            const icon = typeof getMaintIconByName === 'function' ? (getMaintIconByName(task.type) || '🔧') : '🔧';
            const iconColor = typeof getMaintColorByIcon === 'function' ? getMaintColorByIcon(icon) : '#f59e0b';
            const noteText = (task.note || '').trim() || '-';
            const canResolveFromDashboard = displayState === 'pending'
                && status === 'pending'
                && selectedSnapshotDate === todayISO
                && !!task.id;

            const statusHtml = displayState === 'resolved'
                ? `<span class="bg-green-100 text-green-700 px-3 py-1.5 rounded-full text-xs font-bold w-max inline-flex items-center">✅ Resolved</span>`
                : (canResolveFromDashboard
                    ? `<button type="button" onclick="resolveMaintTaskFromDashboard('${String(task.id)}')" class="bg-amber-100 hover:bg-amber-200 text-amber-700 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 w-max transition-colors">
                        <span class="relative flex h-2 w-2">
                          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span class="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                        </span>
                        Pending
                    </button>`
                    : `<span class="bg-amber-100 text-amber-700 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 w-max">
                        <span class="relative flex h-2 w-2">
                          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span class="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                        </span>
                        Pending
                    </span>`);

            const tr = document.createElement('tr');
            tr.className = 'border-b hover:bg-slate-50 transition-colors';
            tr.innerHTML = `
                <td class="p-3">
                    <div class="flex items-center gap-2">
                        <span class="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm shadow-sm" style="background-color: ${iconColor}">${icon}</span>
                        <span class="font-medium text-sm text-gray-700">${task.type || '-'}</span>
                    </div>
                </td>
                <td class="p-3 font-black text-slate-800 text-lg">#${task.roomId || '-'}</td>
                <td class="p-3 text-sm text-gray-600">${noteText}</td>
                <td class="p-3">${statusHtml}</td>
            `;
            maintTableBody.appendChild(tr);
        });

        // อัปเดตตัวเลขป้ายแดงๆ บนหัวการ์ด
        if (maintTaskCountBadge) {
            if (taskCount === 0) {
                maintTaskCountBadge.className = "bg-green-100 text-green-600 px-3 py-1 rounded-full text-xs font-bold";
                maintTaskCountBadge.innerText = "✅ All Clear (ไม่มีงานค้าง)";
                maintTableBody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-gray-400 font-medium">ไม่มีรายการแจ้งซ่อมในวันที่เลือก</td></tr>`;
            } else {
                maintTaskCountBadge.className = "bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold";
                maintTaskCountBadge.innerText = `${taskCount} Task(s)`;
            }
        }
    }
}

function initImagePicker() {
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

    dropzone.addEventListener('click', (e) => {
        if (e.target && e.target.closest && e.target.closest('#image-pick-btn')) return;
        fileInput.click();
    });
    dropzone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click();
        }
    });
    if (pickBtn) {
        pickBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileInput.click();
        });
    }

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

// 🔥 บันทึกข้อมูล (ทำงานกับ HTML ใหม่แน่นอน)
window.saveCanvaItem = async function() {
    if (!currentViewingRoom) return;
    if (selectedSnapshotDate !== getTodayLocal()) { alert("View only (past date)."); return; }

    const nameEl = el('item-name-input');
    const widthEl = el('item-width-input');
    const heightEl = el('item-height-input');
    
    // 1. เพิ่มการดึงค่าจาก Dropdown หน่วย (ที่เราจะไปเพิ่ม id นี้ใน HTML)
    const widthUnitEl = el('item-width-unit'); 
    const heightUnitEl = el('item-height-unit');

    const name = nameEl ? String(nameEl.value || '').trim() : '';
    
    // 2. แก้ไขการเก็บค่า: เอาตัวเลขมาต่อกับหน่วยที่เลือกก่อนบันทึก
    // เช่น ถ้ากรอก 150 และเลือก cm จะได้ "150 cm"
    const width = widthEl && widthEl.value ? `${widthEl.value} ${widthUnitEl.value}` : '';
    const height = heightEl && heightEl.value ? `${heightEl.value} ${heightUnitEl.value}` : '';
    
    const noteEl = el('item-note-input');
    const catEl = el('item-category-input');
    const note = noteEl ? String(noteEl.value || '').trim() : '';
    const image = currentImageData || '';
    const category = catEl ? String(catEl.value || '') : (getItemCategories()[0]?.name || 'อื่นๆ');

    if (!name) { alert("Please enter an item name."); return; }

    const roomId = getRoomId(currentViewingRoom);
    const map = loadRoomInfoMap();
    if (!map[roomId]) map[roomId] = [];

    // 3. บันทึกข้อมูลที่มีหน่วยติดไปด้วยลงใน Database/Storage
    map[roomId].push({ name, width, height, note, image, category });
    roomInfoMapCache = map;
    const saved = await queueSaveRoomInfoMapForRoom(roomId);
    if (!saved) {
        alert("Cannot save item list. Please try again.");
        return;
    }
    if (currentViewingRoom && image) {
        currentViewingRoom.setAttribute('data-room-image', image);
    }

    if (currentViewingRoom) {
        const payload = {
            building: BUILDING_ID,
            room_id: roomId,
            guest_name: getGuestNameFromRoom(currentViewingRoom),
            room_type: getRoomTypeIdForRoom(currentViewingRoom),
            room_note: String(currentViewingRoom.getAttribute('data-room-note') || '').trim(),
            maint_status: String(currentViewingRoom.getAttribute('data-maint') || '').trim(),
            maint_note: String(currentViewingRoom.getAttribute('data-maint-note') || '').trim(),
            ap_installed: currentViewingRoom.getAttribute('data-ap') === 'true' ? 1 : 0,
            ap_install_date: String(currentViewingRoom.getAttribute('data-ap-date') || '').trim(),
            bed_badge: '',
            room_image: image
        };
        apiRequest('save_room_state', payload);
        apiRequest('save_room_snapshot', { ...payload, snapshot_date: getTodayLocal() });
    }

    closeAddItemModal();
    renderRoomInfoList(roomId);
}

window.deleteInfoItem = function(roomId, index) {
    if (selectedSnapshotDate !== getTodayLocal()) { alert("View only (past date)."); return; }
    if(!confirm("Confirm delete this item?")) return;
    const map = loadRoomInfoMap();
    if (map[roomId]) {
        map[roomId].splice(index, 1);
        roomInfoMapCache = map;
        queueSaveRoomInfoMapForRoom(roomId).then((saved) => {
            if (!saved) {
                alert("Cannot save item list after delete. Please try again.");
                return;
            }
            renderRoomInfoList(roomId);
        });
    }
};

// --- (ส่วนเดิม) Admin / Sidebar / Nuclear Fix ---
function renderServiceSidebar() {
    const sidebarContainer = document.getElementById('service-sidebar-list');
    if (!sidebarContainer) return;
    const categories = JSON.parse(localStorage.getItem('maint_cats_final_v1')) || [];
    const stats = getMaintenanceSnapshotStats();
    sidebarContainer.innerHTML = '';

    const totalPending = Array.from(stats.pendingByType.values()).reduce((sum, n) => sum + n, 0);
    const totalResolved = Array.from(stats.resolvedByType.values()).reduce((sum, n) => sum + n, 0);
    const totalTasks = totalPending + totalResolved;
    const highlightOn = document.body.classList.contains('highlight-mode-active');

    const panel = document.createElement('div');
    panel.className = 'service-status-v2';
    panel.innerHTML = `
        <div class="service-v2-kpis">
            <div class="service-v2-kpi service-v2-kpi--pending">
                <div class="service-v2-kpi-num">${totalPending}</div>
                <div class="service-v2-kpi-lbl">PENDING</div>
            </div>
            <div class="service-v2-kpi service-v2-kpi--resolved">
                <div class="service-v2-kpi-num">${totalResolved}</div>
                <div class="service-v2-kpi-lbl">RESOLVED</div>
            </div>
            <div class="service-v2-kpi service-v2-kpi--total">
                <div class="service-v2-kpi-num">${totalTasks}</div>
                <div class="service-v2-kpi-lbl">TOTAL</div>
            </div>
        </div>
        <div class="service-v2-detail-head">
            <span class="service-v2-detail-label">รายละเอียด</span>
            <label class="service-v2-highlight-toggle">
                <span>Highlight</span>
                <span class="service-v2-switch">
                    <input type="checkbox" id="highlightToggle" ${highlightOn ? 'checked' : ''} onchange="toggleHighlightMode(this.checked)">
                    <i></i>
                </span>
            </label>
        </div>
        <div class="service-v2-list"></div>
    `;

    const list = panel.querySelector('.service-v2-list');
    const tones = ['blue', 'amber', 'violet'];
    const visibleCategories = categories.filter(cat => {
        const p = stats.pendingByType.get(cat.name) || 0;
        const r = stats.resolvedByType.get(cat.name) || 0;
        return (p + r) > 0;
    });

    visibleCategories.forEach((cat, index) => {
        const pendingCount = stats.pendingByType.get(cat.name) || 0;
        const resolvedCount = stats.resolvedByType.get(cat.name) || 0;
        const totalByType = pendingCount + resolvedCount;
        const resolvedPercent = totalByType > 0 ? Math.round((resolvedCount / totalByType) * 100) : 0;
        const tone = tones[index] || 'slate';

        const item = document.createElement('button');
        item.type = 'button';
        item.className = `service-v2-item tone-${tone}${activeFilters.has(cat.name.trim()) ? ' is-active' : ''}`;
        item.innerHTML = `
            <div class="service-v2-item-top">
                <div class="service-v2-item-left">
                    <span class="service-v2-icon-box">${cat.icon}</span>
                    <span class="service-v2-name">${cat.name}</span>
                </div>
                <span class="service-v2-pending">${pendingCount} pending</span>
            </div>
            <div class="service-v2-progress-track">
                <span class="service-v2-progress-fill" style="width:${resolvedPercent}%"></span>
            </div>
            <div class="service-v2-item-meta">
                <span>แก้ไขแล้ว ${resolvedCount}/${totalByType}</span>
                <span>${resolvedPercent}%</span>
            </div>
        `;
        item.onclick = () => { toggleFilter(cat.name.trim()); renderServiceSidebar(); };
        list.appendChild(item);
    });

    if (!visibleCategories.length) {
        list.innerHTML = `<div class="service-v2-item tone-slate" style="cursor:default;"><div class="service-v2-item-meta" style="margin-top:0;"><span>ไม่มีงานซ่อมในวันที่เลือก</span><span>0%</span></div></div>`;
    }

    sidebarContainer.appendChild(panel);

    renderResolvedThumbs();
}

function toggleFilter(filterName) {
    const target = filterName.trim();

    if (activeFilters.has(target)) {
        activeFilters.delete(target);
    } else {
        activeFilters.add(target);
    }
    applyActiveFiltersToRooms();
}

function applyActiveFiltersToRooms() {
    const allRooms = getRoomElements();
    document.body.classList.toggle('show-filter-icons', activeFilters.size > 0);
    applyHighlightEffect();
    const categories = (() => {
        try { return JSON.parse(localStorage.getItem('maint_cats_final_v1')) || []; } catch { return []; }
    })();
    const iconMap = new Map(categories.map(c => [c.name.trim(), c.icon]));

    allRooms.forEach(room => {
        // remove only filter-related markers/icons, keep persisted maint-icon from DB
        room.querySelectorAll('.filter-icon').forEach(el => el.remove());
        room.querySelectorAll('.maint-icon.filter-maint-icon').forEach(el => el.remove());
    });

    if (activeFilters.size === 0) {
        // No active filters: restore room colors/state from DB/local storage
        // instead of leaving inline styles cleared.
        try { applySavedRoomStates(); } catch (e) {}
        try { applyRoomStatesFromDb(); } catch (e) {}
        return;
    }

    // First, mark matches and non-matches (do not touch inline background-color)
    allRooms.forEach(room => {
        const rawMaint = room.getAttribute('data-maint') || "";
        const cleanMaint = rawMaint.trim();
        const isMatch = activeFilters.has(cleanMaint) || activeFilters.has(rawMaint);
        if (isMatch) {
            const icon = iconMap.get(cleanMaint) || iconMap.get(rawMaint) || "🔧";
            // add filter icons/maint icons for matches only (do not dim or highlight)
            room.insertAdjacentHTML('beforeend', `<span class="filter-icon" aria-hidden="true">${icon}</span>`);
            const note = (room.getAttribute('data-maint-note') || '').trim();
            const label = note ? `Task: ${note}` : 'Task: Unspecified';
            room.insertAdjacentHTML('beforeend', `<div class="maint-icon filter-maint-icon" data-info="${label}">${icon}</div>`);
        }
    });
}

// Edit Modal Functions (Admin)
async function openEditModal(roomElement) {
    currentEditingRoom = roomElement;
    populateMaintenanceDropdown();
    const roomId = getRoomId(roomElement);
    const roomText = roomElement.innerText.split('\n')[0].trim();
    document.getElementById('modalRoomNumber').innerText = "Edit Room: " + roomText;

    let dbState = null;
    const res = await apiRequest('get_room_state', { building: BUILDING_ID, room_id: roomId });
    if (res && res.room) dbState = res.room;

    const guestName = dbState ? (dbState.guest_name || '') : (roomElement.getAttribute('data-name') || "");
    const roomNote = dbState ? (dbState.room_note || '') : (roomElement.getAttribute('data-room-note') || "");
    const maintStatus = dbState ? (dbState.maint_status || '') : (roomElement.getAttribute('data-maint') || "");
    const maintNote = dbState ? (dbState.maint_note || '') : (roomElement.getAttribute('data-maint-note') || "");
    const apInstalled = dbState ? !!dbState.ap_installed : (roomElement.getAttribute('data-ap') === 'true');
    const apDate = dbState ? (dbState.ap_install_date || '') : (roomElement.getAttribute('data-ap-date') || "");
    const roomTypeValue = dbState ? (dbState.room_type || "type-condo") : (roomElement.getAttribute('data-type') || "type-condo");

    document.getElementById('editGuestName').value = guestName;
    const roomNoteInput = document.getElementById('roomNote');
    if (roomNoteInput) roomNoteInput.value = roomNote;
    document.getElementById('editMaintStatus').value = maintStatus;
    const resolveContainer = document.getElementById('resolve-maint-container');
    if (resolveContainer) {
        if (maintStatus && maintStatus !== '') {
            resolveContainer.classList.remove('hidden'); // ถ้าห้องเสีย ให้โชว์ปุ่ม
        } else {
            resolveContainer.classList.add('hidden'); // ถ้าห้องปกติ ให้ซ่อนปุ่ม
        }
    }
    const maintNoteInput = document.getElementById('maintNote');
    if (maintNoteInput) maintNoteInput.value = maintNote;
    const apCheck = document.getElementById('hasAP');
    const apInput = document.getElementById('apInstallDate');
    if (apCheck) apCheck.checked = apInstalled;
    if (apInput) apInput.value = apDate;
    if (typeof window.toggleAPDate === 'function') window.toggleAPDate();
    const roomTypeInput = document.getElementById('editRoomType');
    if (roomTypeInput) roomTypeInput.value = roomTypeValue;
    if (typeof window.updateRoomTypeDisplay === 'function') {
        window.updateRoomTypeDisplay(roomTypeValue);
    }
    document.getElementById('roomEditModal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('roomEditModal').classList.add('hidden');
    currentEditingRoom = null;
}

function populateMaintenanceDropdown() {
    const select = document.getElementById('editMaintStatus');
    const categories = JSON.parse(localStorage.getItem('maint_cats_final_v1')) || [];
    select.innerHTML = '<option value="">(None)</option>'; 
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.name; option.innerText = `${cat.icon} ${cat.name}`; select.appendChild(option);
    });
}

// --- Init ---
document.addEventListener('DOMContentLoaded', async function() {
    await syncRoomTypesFromDb();
    await syncItemCategoriesFromDb();
    document.body.classList.remove('show-filter-icons');
    let isEditMode = false;
    const editModeBtn = document.getElementById('edit-mode-btn');
    const isAdminUser = () => localStorage.getItem("isAdmin") === "true";
    initImagePicker();
    initImageViewer();
    clearRoomTypeColors();


    if (editModeBtn) {
        const editIcon = document.getElementById('edit-icon');
        if (!isAdminUser()) {
            isEditMode = false;
            if (editIcon) editIcon.innerText = "🔒";
            document.getElementById('edit-mode-text').innerText = "LOCK MODE";
            editModeBtn.classList.remove('bg-orange-500', 'text-white');
        }
        if (editIcon) editIcon.innerText = "🔒";
        editModeBtn.onclick = function() {
            if (selectedSnapshotDate !== getTodayLocal()) { alert("View only (past date)."); return; }
            if (!isAdminUser()) { alert("Admin only."); return; }
            isEditMode = !isEditMode;
            if (editIcon) editIcon.innerText = isEditMode ? "🔓" : "🔒";
            document.getElementById('edit-mode-text').innerText = isEditMode ? "EDIT MODE: ON" : "LOCK MODE";
            this.classList.toggle('bg-orange-500', isEditMode);
            this.classList.toggle('text-white', isEditMode);
            this.classList.toggle('btn-edit-on', isEditMode);
        };
    }

getRoomElements().forEach(el => {
    el.onclick = async (e) => {
        e.stopPropagation();
        
        // ==========================================
        // ⚡ โหมด QUICK UPDATE (วาดไอคอนทันทีที่จิ้ม)
        // ==========================================
        if (typeof quickModeActive !== 'undefined' && quickModeActive && selectedQuickStatus !== '') {
            const roomId = getRoomId(el);
            const currentMaint = el.getAttribute('data-maint') || "";
            
            // สลับสถานะ: ถ้ากดสถานะเดิมให้เอาออก ถ้ากดอันใหม่ให้เปลี่ยน
            const newStatus = (currentMaint === selectedQuickStatus) ? '' : selectedQuickStatus;
            
            // 1. ทำให้ปุ่มกระตุกนิดนึงให้รู้ว่าจิ้มติดแล้ว
            el.style.transform = 'scale(0.95)';
            setTimeout(() => el.style.transform = 'scale(1)', 150);

            // 2. อัปเดตสถานะที่หน้าห้องทันที
            el.setAttribute('data-maint', newStatus);

            // 3. วาดไอคอนหรือลบไอคอน (Real-time UI)
            const existingBadges = el.querySelectorAll('.quick-badge-icon, .maint-badge');
            existingBadges.forEach(badge => badge.remove()); // ล้างของเก่าออกก่อน

            if (newStatus !== '') {
                // ไปดึงไอคอน Emoji (เช่น ❄️, ⚡) มาจากปุ่มบนแถบดำที่กำลังเลือกอยู่
                const activeBtn = document.querySelector('.quick-tool-btn.bg-blue-600');
                let iconText = '🔧'; 
                if (activeBtn) {
                    const span = activeBtn.querySelector('span');
                    iconText = span ? span.innerText : activeBtn.innerText.trim().charAt(0);
                }
                // สร้างไอคอนวงกลม แปะไว้มุมขวาบนของห้อง
                const iconDiv = document.createElement('div');
                iconDiv.className = 'quick-badge-icon absolute -top-2 -right-2 w-6 h-6 bg-white border-2 border-red-500 rounded-full flex items-center justify-center shadow-lg text-[11px] z-50';
                iconDiv.innerHTML = iconText;
                el.appendChild(iconDiv);
            }

            // 4. แอบส่งข้อมูลไปเซฟใน Database หลังบ้าน (ไม่ต้องรอหน้าจอโหลด)
            const payload = {
                building: typeof BUILDING_ID !== 'undefined' ? BUILDING_ID : 'A',
                room_id: roomId,
                guest_name: (el.getAttribute('data-name') || '').trim(),
                room_type: el.getAttribute('data-type') || '',
                maint_status: newStatus,
                maint_note: newStatus ? 'Quick Update' : '', 
                ap_installed: el.getAttribute('data-ap') === 'true' ? 1 : 0,
                ap_install_date: el.getAttribute('data-ap-date') || '',
                room_image: getRoomImage(el)
            };

            try {
                await apiRequest('save_room_state', payload);
                await loadMaintenanceTasksFromDb();
                // สั่งซิงค์เงียบๆ เผื่ออัปเดต Service Status แถบซ้ายมือ
                if (typeof window.applyRoomStatesFromDb === 'function') window.applyRoomStatesFromDb();
                if (typeof window.renderServiceSidebar === 'function') window.renderServiceSidebar();
            } catch (error) {
                console.error('Save error:', error);
            }
            
            return; // จบการทำงานโหมด Quick
        }

        // ==========================================
        // 🏠 โหมดการคลิกปกติ (ดูรายละเอียดห้อง)
        // ==========================================
        if (typeof selectedSnapshotDate !== 'undefined' && selectedSnapshotDate !== getTodayLocal()) { 
            if (typeof openRoomInfoModal === 'function') openRoomInfoModal(el); 
            return; 
        }
        if (typeof isEditMode !== 'undefined' && isEditMode && typeof isAdminUser === 'function' && isAdminUser()) {
            if (typeof openEditModal === 'function') openEditModal(el); 
        } else {
            if (typeof openRoomInfoModal === 'function') openRoomInfoModal(el);
        }
    };
});
   // Save Edit Room
const btnSave = document.getElementById('saveRoomInfo');
if (btnSave) {
    btnSave.onclick = async function() {
        if (!currentEditingRoom) return;
        if (selectedSnapshotDate !== getTodayLocal()) { 
            alert("View only (past date)."); 
            return; 
        }

        const name = document.getElementById('editGuestName').value.trim();
        const roomNote = document.getElementById('roomNote')?.value?.trim() || "";
        const typeClass = document.getElementById('editRoomType').value;
        const maintStatus = document.getElementById('editMaintStatus').value.trim();
        const maintNote = document.getElementById('maintNote')?.value?.trim() || "";
        const apChecked = document.getElementById('hasAP')?.checked;
        const apDate = document.getElementById('apInstallDate')?.value || "";
        const roomId = getRoomId(currentEditingRoom);

        currentEditingRoom.setAttribute('data-name', name);
        currentEditingRoom.setAttribute('data-room-note', roomNote);
        currentEditingRoom.setAttribute('data-maint', maintStatus);
        currentEditingRoom.setAttribute('data-type', typeClass);
        currentEditingRoom.setAttribute('data-maint-note', maintNote);
        currentEditingRoom.setAttribute('data-ap', apChecked ? 'true' : 'false');
        currentEditingRoom.setAttribute('data-ap-date', apDate);

        let badgesHtml = '';

        if (apChecked) {
            const label = apDate ? `Installed: ${apDate}` : 'Installed: Unspecified';
            badgesHtml += `<div class="ap-badge" data-info="${label}">
                                <span class="ap-dot"></span>
                           </div>`;
        }

        if (maintStatus) {
            const icon = getMaintIcon(maintStatus) || '🔧';
            const note = maintNote ? `Task: ${maintNote}` : 'Task: Unspecified';
            badgesHtml += `<div class="maint-icon" data-info="${note}">
                                ${icon}
                           </div>`;
        }

        if (typeClass) {
            const typeColor = getRoomTypeColorById(typeClass);
            if (typeColor)
                currentEditingRoom.style.setProperty('background-color', typeColor, 'important');
            else
                currentEditingRoom.style.setProperty('background-color', 'transparent', 'important');
        } else {
            currentEditingRoom.style.setProperty('background-color', 'transparent', 'important');
        }

        const contentHtml = `
            <div class="room-content">
                <div class="room-num">${getRoomNumber(currentEditingRoom)}</div>
                <div class="guest-name">${name}</div>
            </div>
        `;

        currentEditingRoom.innerHTML = contentHtml + badgesHtml;

        // 🔥 SAVE TO DB
        const payload = {
            building: BUILDING_ID,
            room_id: roomId,
            guest_name: name,
            room_type: typeClass,
            room_note: roomNote,
            maint_status: maintStatus,
            maint_note: maintNote,
            ap_installed: apChecked ? 1 : 0,
            ap_install_date: apDate,
            bed_badge: '',
            room_image: getRoomImage(currentEditingRoom)
        };

        // 1. อัปเดตสถานะปัจจุบัน (ตาราง rooms_status)
        await apiRequest('save_room_state', payload);

        // 2. บันทึกประวัติของวันนี้ (ตาราง room_status_history)
        await apiRequest('save_room_snapshot', {
            ...payload,
            snapshot_date: getTodayLocal() // ดึงวันที่ปัจจุบันส่งไปด้วย
        });
        await loadMaintenanceTasksFromDb();

        closeModal();
        renderServiceSidebar();
        if (!document.getElementById('dashboardModal')?.classList.contains('hidden') && typeof window.updateDashboardCharts === 'function') {
            window.updateDashboardCharts();
        }

        if (activeFilters.size > 0) {
            applyActiveFiltersToRooms();
            renderServiceSidebar();
        }
    };
}


    const btnCancel = document.getElementById('closeModal');
    if (btnCancel) btnCancel.onclick = closeModal;
    const closeIcon = document.getElementById('closeIcon');
    if (closeIcon) closeIcon.onclick = closeModal;

    // Render connecting arrows from saved features on initial load
    function getMaintIcon(maintName) {
        return getMaintIconByName(maintName);
    }

        // Resolve room state by trying several id forms so display labels like
        // "2101 Floor 2" or "1103 - 1104" can match DB keys like "2101" or "1103".
        function resolveStateForRoom(map, roomId) {
            if (!map || !roomId) return null;
            if (map[roomId]) return map[roomId];

            // Try numeric prefix: "2101 Floor 2" -> "2101"
            const prefix = (roomId.match(/^\s*([0-9]+)\b/) || [])[1];
            if (prefix && map[prefix]) return map[prefix];

            // Try range like "1103-1104" -> try first then second
            const range = (roomId.match(/([0-9]+)\s*[-–]\s*([0-9]+)/) || []);
            if (range && range[1]) {
                if (map[range[1]]) return map[range[1]];
                if (range[2] && map[range[2]]) return map[range[2]];
                const hy = `${range[1]}-${range[2]}`;
                if (map[hy]) return map[hy];
            }

            // Fallback: digits only
            const digitsOnly = roomId.replace(/[^0-9]/g, '');
            if (digitsOnly && map[digitsOnly]) return map[digitsOnly];

            return null;
        }

    function applyRoomStates(map) {
        if (!map || typeof map !== 'object') return;

        getRoomElements().forEach(room => {
            const roomId = getRoomId(room);
            const state = resolveStateForRoom(map, roomId);

            // 🔥 FIX: ถ้าย้อนอดีตไปเจอวันที่ "ไม่มีข้อมูล" ให้ล้างสีและไอคอนทิ้งทันที
            if (!state) {
                room.classList.remove(...ALL_COLOR_CLASSES);
                room.removeAttribute('data-name');
                room.removeAttribute('data-room-note');
                room.removeAttribute('data-maint');
                room.removeAttribute('data-maint-note');
                room.setAttribute('data-ap', 'false');
                room.removeAttribute('data-ap-date');
                room.removeAttribute('data-type');
                room.removeAttribute('data-room-image');
                room.style.setProperty('background-color', 'transparent', 'important');
                
                room.innerHTML = `
                    <div class="room-content">
                        <div class="room-num">${getRoomNumber(room)}</div>
                        <div class="guest-name"></div>
                    </div>
                `;
                return; // ล้างเสร็จแล้วข้ามห้องนี้ไปเลย
            }

            // ถ้ามีข้อมูล ก็ดึงมาแสดงตามปกติ
            const name = state.name ?? state.guest_name ?? '';
            const roomNote = (state.roomNote ?? state.room_note ?? '').trim();
            const typeClass = state.typeClass ?? state.room_type ?? '';
            const maintStatus = (state.maintStatus ?? state.maint_status ?? '').trim();
            const maintNote = (state.maintNote ?? state.maint_note ?? '').trim();
            const apChecked = !!(state.apChecked ?? state.ap_installed);
            const apDate = state.apDate ?? state.ap_install_date ?? '';
            const roomImage = (state.roomImage ?? state.room_image ?? '').trim();

            room.classList.remove(...ALL_COLOR_CLASSES);
            room.setAttribute('data-name', name);
            room.setAttribute('data-room-note', roomNote);
            room.setAttribute('data-maint', maintStatus);
            room.setAttribute('data-maint-note', maintNote);
            room.setAttribute('data-ap', apChecked ? 'true' : 'false');
            room.setAttribute('data-ap-date', apDate);
            room.setAttribute('data-type', typeClass || '');
            room.setAttribute('data-room-image', roomImage);

            let badgesHtml = '';
            if (apChecked) {
                const label = apDate ? `Installed: ${apDate}` : 'Installed: Unspecified';
                badgesHtml += `<div class="ap-badge" data-info="${label}"><span class="ap-dot"></span></div>`;
            }
            if (maintStatus) {
                const icon = getMaintIcon(maintStatus) || '🔧';
                const note = maintNote ? `Task: ${maintNote}` : 'Task: Unspecified';
                badgesHtml += `<div class="maint-icon" data-info="${note}">${icon}</div>`;
            }

            const contentHtml = `
                <div class="room-content">
                    <div class="room-num">${getRoomNumber(room)}</div>
                    <div class="guest-name">${name}</div>
                </div>
            `;

            room.innerHTML = contentHtml + badgesHtml;

            if (typeClass) {
                const typeColor = getRoomTypeColor(typeClass);
                if (typeColor) room.style.setProperty('background-color', typeColor, 'important');
                else room.style.setProperty('background-color', 'transparent', 'important');
            } else {
                room.style.setProperty('background-color', 'transparent', 'important');
                applyHighlightEffect();
            }
        });
        if (typeof window.applyRoomTypeLegendHighlight === 'function') {
            window.applyRoomTypeLegendHighlight();
        }
        renderResolvedThumbs();
    }

    function applySavedRoomStates() {
        const map = loadRoomStateMap();
        applyRoomStates(map);
    }

    async function applyRoomStatesFromDb() {
        const isToday = selectedSnapshotDate === getTodayLocal();
        const res = isToday
            ? await apiRequest('get_all_room_states', { building: BUILDING_ID })
            : await apiRequest('get_room_snapshots', { building: BUILDING_ID, snapshot_date: selectedSnapshotDate });
        if (!res || !Array.isArray(res.rooms)) return;
        const map = {};
        // Build a flexible lookup map with normalized keys so labels with spaces/hyphens still match DB
        res.rooms.forEach(row => {
            const rawId = (row.room_id || '').toString();
            const idTrim = rawId.trim();
            if (!idTrim) return;
            // original
            map[idTrim] = row;
            // no-spaces
            map[idTrim.replace(/\s+/g, '')] = row;
            // normalized hyphen (e.g. "1103 - 1104" -> "1103-1104")
            map[idTrim.replace(/\s*[-–]\s*/g, '-') ] = row;
            // digits-only
            const digits = idTrim.replace(/\D/g, '');
            if (digits) map[digits] = row;
        });
        // Debug: show what room ids we received from the server
        try { console.log('DEBUG: DB room keys ->', Object.keys(map)); } catch (e) {}
        applyRoomStates(map);
    }
    window.applyRoomStatesFromDb = applyRoomStatesFromDb;

    // snapshot diffing removed per user request (no badges shown)

    document.addEventListener('date-selected', async (e) => {
        try {
            const iso = e?.detail?.date || null;
            if (!iso) return;
            const d = new Date(iso);
            d.setHours(0,0,0,0);
            
            // 🔥 บังคับ Format ให้เป็น YYYY-MM-DD เท่านั้น (สำคัญมาก)
            selectedSnapshotDate = formatDateLocal(d);
            localStorage.setItem(DATE_STORAGE_KEY, selectedSnapshotDate);

            // โหลดข้อมูลห้องและสิ่งของจากฐานข้อมูลแบบ Real-time
            await applyRoomStatesFromDb();
            await loadRoomInfoMapFromDb(selectedSnapshotDate);
            await loadMaintenanceTasksFromDb();

            // อัปเดตแถบ Service Status ด้านซ้ายให้ตรงกับวันนั้นๆ
            if (typeof renderServiceSidebar === 'function') {
                renderServiceSidebar();
            }
            if (!document.getElementById('dashboardModal')?.classList.contains('hidden') && typeof window.updateDashboardCharts === 'function') {
                window.updateDashboardCharts();
            }
        } catch (err) {
            console.warn('date-selected handler failed', err);
        }
    });

    function applyMaintenanceIcons() {
        document.querySelectorAll('.room').forEach(room => {
            room.querySelectorAll('.maint-icon').forEach(el => el.remove());
        });
    }

    function applyApBadges() {
        document.querySelectorAll('.room').forEach(room => {
            const apInstalled = room.getAttribute('data-ap') === 'true';
            if (!apInstalled) return;
            if (room.querySelector('.ap-badge')) return;
            const apDate = room.getAttribute('data-ap-date') || '';
            const label = apDate ? `Installed: ${apDate}` : 'Installed: Unspecified';
            room.insertAdjacentHTML('beforeend', `<div class="ap-badge" data-info="${label}"><span class="ap-dot"></span></div>`);
        });
    }

    applySavedRoomStates();
        // Auto-assign data-room-id for rooms that don't have one yet.
        // This helps match displayed labels (e.g. "2101 Floor 2", "1103 - 1104")
        // to DB room_id values so colors persist after refresh.
        function autoAssignDataRoomId() {
            document.querySelectorAll('.room').forEach(room => {
                if (room.getAttribute('data-room-id')) return;
                const text = (room.innerText || '').trim();
                if (!text) return;
                const firstLine = text.split('\n')[0].trim();

                // Range like "1103 - 1104" or "1101-02"
                const range = firstLine.match(/([0-9]+)\s*[-–]\s*([0-9]+)/);
                if (range) {
                    room.setAttribute('data-room-id', `${range[1]}-${range[2]}`);
                    return;
                }

                // Prefix number like "2101 Floor 2" -> use 2101
                const prefix = firstLine.match(/^\s*([0-9]{2,5})\b/);
                if (prefix) {
                    room.setAttribute('data-room-id', prefix[1]);
                    return;
                }

                // Fallback: digits only
                const digits = firstLine.replace(/\D/g, '');
                if (digits) room.setAttribute('data-room-id', digits);
            });
        }

    // Ensure room elements have stable ids before requesting DB states
    autoAssignDataRoomId();

    // Fetch DB states, then continue initialization that depends on those states
    applyRoomStatesFromDb().then(async () => {
        await loadRoomInfoMapFromDb(selectedSnapshotDate);
        await loadMaintenanceTasksFromDb();
        applyApBadges();
        renderServiceSidebar();
        initAdminButtonShared();
        initDashboardSummary();
    }).catch(() => {
        // on error still attempt to render sidebar and init
        loadRoomInfoMapFromDb(selectedSnapshotDate);
        loadMaintenanceTasksFromDb();
        applyApBadges();
        renderServiceSidebar();
        initAdminButtonShared();
        initDashboardSummary();
    });

    // Click to toggle icon tooltip (sticky) + prevent room modal
    document.addEventListener('click', (e) => {
        const maintIcon = e.target.closest('.maint-icon');
        const apIcon = e.target.closest('.ap-badge');

        if (maintIcon || apIcon) {
            e.stopPropagation();
            document.querySelectorAll('.maint-icon.is-open, .ap-badge.is-open').forEach(el => {
                if (el !== maintIcon && el !== apIcon) el.classList.remove('is-open');
            });
            if (maintIcon) maintIcon.classList.toggle('is-open');
            if (apIcon) apIcon.classList.toggle('is-open');
            return;
        }

    document.querySelectorAll('.maint-icon.is-open, .ap-badge.is-open').forEach(el => el.classList.remove('is-open'));
    }, true);

    // Move side panels out of transformed plan so they no longer overlay/shift with scaling.
    function hoistSidePanelsOutOfBuilding() {
        const wrapper = document.querySelector('.plan-wrapper');
        const building = wrapper?.querySelector('.building-plan, .building');
        const leftPanel = document.querySelector('.legend-block.left-info-panel');
        const rightPanel = document.querySelector('.legend-block.main-legend');
        if (!wrapper || !building) return;

        if (leftPanel && building.contains(leftPanel)) {
            wrapper.insertBefore(leftPanel, building);
        }
        if (rightPanel && building.contains(rightPanel)) {
            wrapper.insertBefore(rightPanel, building);
        }
    }

    // Hard-force side panels away from the plan area on desktop.
    function enforceSidePanelsLayout() {
        const wrapper = document.querySelector('.plan-wrapper');
        const leftPanel = document.querySelector('.legend-block.left-info-panel');
        const rightPanel = document.querySelector('.legend-block.main-legend');
        if (!wrapper) return;

        const isPrintMode =
            document.body.classList.contains('print-report') ||
            document.body.classList.contains('print-plan') ||
            window.matchMedia('print').matches;
        if (isPrintMode) {
            wrapper.style.removeProperty('padding-left');
            wrapper.style.removeProperty('padding-right');
            [leftPanel, rightPanel].forEach((panel) => {
                if (!panel) return;
                panel.style.removeProperty('position');
                panel.style.removeProperty('top');
                panel.style.removeProperty('left');
                panel.style.removeProperty('right');
                panel.style.removeProperty('width');
                panel.style.removeProperty('max-height');
                panel.style.removeProperty('overflow-y');
                panel.style.removeProperty('z-index');
                panel.style.removeProperty('margin');
            });
            return;
        }

        const isDesktop = window.matchMedia('(min-width: 1025px)').matches;
        const nav = document.querySelector('.page-navbar');
        const topOffset = (nav?.offsetHeight || 80) + 44;

        if (isDesktop) {
            wrapper.style.setProperty('padding-left', '318px', 'important');
            wrapper.style.setProperty('padding-right', '286px', 'important');

            [leftPanel, rightPanel].forEach((panel) => {
                if (!panel) return;
                panel.style.setProperty('position', 'fixed', 'important');
                panel.style.setProperty('top', `${topOffset}px`, 'important');
                panel.style.setProperty('width', '276px', 'important');
                panel.style.setProperty('max-height', `calc(100vh - ${topOffset + 24}px)`, 'important');
                panel.style.setProperty('overflow-y', 'auto', 'important');
                panel.style.setProperty('z-index', '4000', 'important');
            });

            if (leftPanel) {
                leftPanel.style.setProperty('left', '16px', 'important');
                leftPanel.style.setProperty('right', 'auto', 'important');
            }
            if (rightPanel) {
                rightPanel.style.setProperty('right', '16px', 'important');
                rightPanel.style.setProperty('left', 'auto', 'important');
            }
        } else {
            wrapper.style.setProperty('padding-left', '12px', 'important');
            wrapper.style.setProperty('padding-right', '12px', 'important');

            [leftPanel, rightPanel].forEach((panel) => {
                if (!panel) return;
                panel.style.setProperty('position', 'static', 'important');
                panel.style.setProperty('top', 'auto', 'important');
                panel.style.setProperty('left', 'auto', 'important');
                panel.style.setProperty('right', 'auto', 'important');
                panel.style.setProperty('width', 'min(100%, 560px)', 'important');
                panel.style.setProperty('max-height', 'none', 'important');
                panel.style.setProperty('overflow-y', 'visible', 'important');
                panel.style.setProperty('margin', '0 auto 12px', 'important');
            });
        }
    }

    // Fit the whole plan section to current viewport width.
    function scaleBuildingToFit() {
        const building = document.querySelector('.building-plan, .building');
        const wrapper = document.querySelector('.plan-wrapper');
        if (!building || !wrapper) return;

        const planWidth = building.scrollWidth || building.getBoundingClientRect().width;
        const planHeight = building.scrollHeight || building.getBoundingClientRect().height;
        const wrapRect = wrapper.getBoundingClientRect();
        const wrapStyle = getComputedStyle(wrapper);
        const padLeft = parseFloat(wrapStyle.paddingLeft) || 0;
        const padRight = parseFloat(wrapStyle.paddingRight) || 0;
        const safetyGap = 16;
        const available = wrapRect.width - padLeft - padRight - safetyGap;

        if (available <= 0 || !planWidth) return;

        const scale = Math.min(1, Math.max(0.35, available / planWidth));
        building.style.transform = `scale(${scale})`;
        wrapper.style.minHeight = `${Math.ceil(planHeight * scale) + 24}px`;
    }

    hoistSidePanelsOutOfBuilding();
    enforceSidePanelsLayout();
    scaleBuildingToFit();
    window.addEventListener('resize', () => {
        window.requestAnimationFrame(hoistSidePanelsOutOfBuilding);
        window.requestAnimationFrame(enforceSidePanelsLayout);
        window.requestAnimationFrame(scaleBuildingToFit);
    });
    window.addEventListener('beforeprint', enforceSidePanelsLayout);
    window.addEventListener('afterprint', () => {
        window.requestAnimationFrame(hoistSidePanelsOutOfBuilding);
        window.requestAnimationFrame(enforceSidePanelsLayout);
        window.requestAnimationFrame(scaleBuildingToFit);
    });
});

function renderDateStrip() {
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
                renderDateStrip();
                if (typeof window.applyRoomStatesFromDb === 'function') {
                    await window.applyRoomStatesFromDb();
                }
                await loadRoomInfoMapFromDb(selectedSnapshotDate);
                await loadMaintenanceTasksFromDb();
                
                // 🔥 สั่งอัปเดตแถบ Service ด้านซ้ายทันทีเมื่อกดเปลี่ยนวัน
                if (typeof renderServiceSidebar === 'function') {
                    renderServiceSidebar();
                }
                if (!document.getElementById('dashboardModal')?.classList.contains('hidden') && typeof window.updateDashboardCharts === 'function') {
                    window.updateDashboardCharts();
                }
            });
        strip.appendChild(btn);
    }
    // ensure selected label shows
    const sel = document.getElementById('dateSelected');
    if (sel) {
        const d = new Date(selectedSnapshotDate);
        sel.textContent = isNaN(d.getTime())
            ? selectedSnapshotDate
            : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    // Create nav buttons behavior
    const prev = document.getElementById('datePrev');
    const next = document.getElementById('dateNext');
    if (strip && prev && next) {
        strip.style.scrollBehavior = 'smooth';
        prev.onclick = () => { strip.scrollBy({ left: -120, behavior: 'smooth' }); };
        next.onclick = () => { strip.scrollBy({ left: 120, behavior: 'smooth' }); };
        // Scroll active into view
        const active = strip.querySelector('.date-pill.active');
        if (active) active.scrollIntoView({ inline: 'center', behavior: 'instant' });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    renderDateStrip();
});

// Shared Admin Button
function initAdminButtonShared() {
    const adminBtn = document.getElementById("adminBtn");
    const btnText = document.getElementById("btnText");
    const btnIcon = document.getElementById("btnIcon");
    if (!adminBtn || !btnText || !btnIcon) return;

    const modal = document.getElementById("adminModal");
    const passInput = document.getElementById("adminPassword");
    const loginBtn = document.getElementById("loginConfirm");
    const cancelBtn = document.getElementById("loginCancel");

    const adminClass = "flex items-center gap-2 px-6 py-2.5 rounded-full bg-green-600 border-2 border-green-600 text-white text-xs font-black hover:bg-green-700 transition-all duration-300 group shadow-sm nav-btn-shape";
    const guestClass = "flex items-center gap-2 px-6 py-2.5 rounded-full border-2 border-slate-800 text-slate-800 text-xs font-black hover:bg-slate-800 hover:text-white transition-all duration-300 group shadow-sm nav-btn-shape";
    const ADMIN_PASSWORD = "1234";

    const applyState = () => {
        if (localStorage.getItem("isAdmin") === "true") {
            btnText.textContent = "ADMIN ACTIVE";
            adminBtn.className = adminClass;
            btnIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />';
            btnIcon.classList.remove("group-hover:translate-x-1");
        } else {
            btnText.textContent = "STAFF LOGIN";
            adminBtn.className = guestClass;
            btnIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 01-3-3h7a3 3 0 013 3v1" />';
            btnIcon.classList.add("group-hover:translate-x-1");
        }
    };

    adminBtn.addEventListener("click", () => {
        if (localStorage.getItem("isAdmin") === "true") {
            if (confirm("Log out of Admin?")) {
                localStorage.removeItem("isAdmin");
                applyState();
                window.location.reload();
            }
        } else if (modal) {
            modal.classList.remove("hidden");
            if (passInput) { passInput.value = ""; passInput.focus(); }
        }
    });

    if (loginBtn && passInput && modal) {
        loginBtn.addEventListener("click", () => {
            if (passInput.value === ADMIN_PASSWORD) {
                localStorage.setItem("isAdmin", "true");
                applyState();
                modal.classList.add("hidden");
                alert("Admin mode enabled ✅");
            } else {
                alert("Incorrect password ❌");
            }
        });
    }

    if (passInput && loginBtn) {
        passInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") loginBtn.click();
        });
    }

    if (cancelBtn && modal) {
        cancelBtn.addEventListener("click", () => modal.classList.add("hidden"));
        modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });
    }

    window.addEventListener("storage", (e) => { if (e.key === "isAdmin") applyState(); });
    applyState();
}

function initDashboardSummary() {
    const btn = document.getElementById('dashboardBtn');
    const modal = document.getElementById('dashboardModal');
    const closeBtn = document.getElementById('dashboardClose');
    const printBtn = document.getElementById('dashboardPrint');
    const content = document.getElementById('dashboardContent');
    if (!btn || !modal || !content) return;

    btn.addEventListener('click', () => {
        modal.classList.remove('hidden');
        scaleDashboardPlan();
        window.updateDashboardCharts();
    });

    if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
    if (printBtn) printBtn.addEventListener('click', () => {
        prepareReportPrint();
        window.print();
    });

    function scaleDashboardPlan() {
        const planWrap = document.querySelector('.dashboard-plan');
        const plan = planWrap?.querySelector('.building-plan, .building, .building-b-wrapper');
        if (!planWrap || !plan) return;

        const wrapWidth = planWrap.clientWidth;
        const planWidth = plan.scrollWidth || plan.getBoundingClientRect().width;
        if (!wrapWidth || !planWidth) return;

        const scale = Math.min(1, wrapWidth / planWidth);
        planWrap.style.setProperty('--plan-scale', scale.toFixed(4));
    }

    window.addEventListener('resize', scaleDashboardPlan);

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
        const plan = document.querySelector('.building-plan, .building, .building-b-wrapper');
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
        const isBuildingB = document.body.getAttribute('data-building-id') === 'B' || plan.classList.contains('building-b-wrapper');
        const fitMultiplier = isBuildingB ? 0.92 : 1.12;
        const scale = Math.min(scaleX, scaleY) * fitMultiplier;
        const scaledW = planHeight * scale;
        const scaledH = planWidth * scale;
        const extraShiftX = isBuildingB ? 110 : 120;
        const extraShiftY = isBuildingB ? -260 : 0;
        const translateX = (printableW - scaledW) / 2 + extraShiftX;
        const translateY = (printableH - scaledH) / 2 + scaledH + extraShiftY;
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
        window.updateDashboardCharts();
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
// 🔥 ทำให้ปุ่ม "ปิดงานซ่อม" โชว์/ซ่อน ทันทีที่กดเปลี่ยน Dropdown
document.getElementById('editMaintStatus')?.addEventListener('change', function() {
    const resolveContainer = document.getElementById('resolve-maint-container');
    if (resolveContainer) {
        if (this.value !== '') {
            resolveContainer.classList.remove('hidden'); // ถ้าเลือกซ่อมอะไรสักอย่าง โชว์ปุ่มเลย!
        } else {
            resolveContainer.classList.add('hidden'); // ถ้าเปลี่ยนกลับเป็น (None) ก็ซ่อนปุ่ม
        }
    }
});
// 🔥 คำสั่งเมื่อกดปุ่ม "ปิดงานซ่อม" (สเต็ปที่ 3)
document.getElementById('btn-resolve-maint')?.addEventListener('click', function() {
    if (!confirm('ยืนยันว่างานซ่อมห้องนี้เสร็จสิ้นแล้วใช่หรือไม่?')) return;
    document.getElementById('editMaintStatus').value = '';
    document.getElementById('maintNote').value = '';
    const resolveContainer = document.getElementById('resolve-maint-container');
    if (resolveContainer) resolveContainer.classList.add('hidden');
    document.getElementById('saveRoomInfo').click(); 
});
// --- ส่วนที่ 1: ตัวแปรควบคุม Quick Mode ---
let quickModeActive = false;
let selectedQuickStatus = '';

// ฟังก์ชันเปิดโหมด Quick Update
window.enableQuickMode = function() {
    if (localStorage.getItem("isAdmin") !== "true") { 
        alert("🔒 Staff only"); 
        return; 
    }
    const statusBar = document.getElementById('quick-status-bar');
    if (statusBar) statusBar.classList.remove('hidden');
    
    // สร้างปุ่มไอคอนตามหมวดหมู่ที่มีใน Settings
    const container = document.getElementById('quick-tool-options');
    if (container) {
        const categories = getMaintenanceCategories(); 
        container.innerHTML = '';
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = `quick-tool-btn px-4 py-2 rounded-xl bg-white/5 text-white/70 text-xs font-bold hover:bg-white/10 transition-all border border-white/10 cursor-pointer flex items-center gap-2`;
            btn.innerHTML = `<span>${cat.icon}</span> ${cat.name}`;
            btn.onclick = () => {
                quickModeActive = true;
                selectedQuickStatus = cat.name;
                // เปลี่ยนสีปุ่มที่ถูกเลือก
                document.querySelectorAll('.quick-tool-btn').forEach(b => {
                    b.classList.remove('bg-blue-600', 'text-white');
                    b.classList.add('bg-white/5', 'text-white/70');
                });
                btn.classList.remove('bg-white/5', 'text-white/70');
                btn.classList.add('bg-blue-600', 'text-white');
            };
            container.appendChild(btn);
        });
    }
};

// ฟังก์ชันปิดโหมด
window.disableQuickMode = function() {
    quickModeActive = false;
    selectedQuickStatus = '';
    const statusBar = document.getElementById('quick-status-bar');
    if (statusBar) statusBar.classList.add('hidden');
};
// ฟังก์ชันสำหรับสวิตช์เปิด-ปิด Highlight Mode
window.toggleHighlightMode = function(isActive) {
    if (isActive) {
        document.body.classList.add('highlight-mode-active');
        applyHighlightEffect(); // อัปเดตสถานะห้องทันที
    } else {
        document.body.classList.remove('highlight-mode-active');
        // ล้าง Effect ทั้งหมดเพื่อให้ทุกห้องกลับมาปกติ
        document.querySelectorAll('.room').forEach(room => {
            room.classList.remove('is-dimmed-force', 'is-highlight-force');
        });
    }
};

// ฟังก์ชันคำนวณว่าห้องไหนควรจาง (Dim) หรือควรชัด (Highlight)
function applyHighlightEffect() {
    // ทำงานเฉพาะตอนเปิดโหมด Highlight เท่านั้น
    if (!document.body.classList.contains('highlight-mode-active')) return;

    const rooms = document.querySelectorAll('.room');
    rooms.forEach(room => {
        const roomMaint = (room.getAttribute('data-maint') || '').trim();
        
        if (activeFilters.size === 0) {
            // ถ้าไม่ได้เลือกฟิลเตอร์อะไรเลย ให้แสดงผลปกติทุกห้อง
            room.classList.remove('is-dimmed-force', 'is-highlight-force');
        } else if (activeFilters.has(roomMaint)) {
            // ถ้าห้องตรงกับสถานะที่เลือก ให้คงสภาพปกติ (ไม่เด้ง)
            room.classList.remove('is-dimmed-force');
            room.classList.remove('is-highlight-force');
        } else {
            // ถ้าห้องไม่ตรง ให้จางลง
            room.classList.remove('is-highlight-force');
            room.classList.add('is-dimmed-force');
        }
    });
}
