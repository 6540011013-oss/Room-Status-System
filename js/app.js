/* =========================================================
   Room Status System - Building A (CANVA EXACT STYLE V2)
   - แก้ไขให้ปุ่มกดทำงานได้จริงกับ HTML ชุดใหม่
========================================================= */

let currentEditingRoom = null;
let currentViewingRoom = null;
let activeFilters = new Set(); 
let currentCategoryFilter = 'all';
let itemTextOnlyMode = false;
let currentImageData = '';
let currentImageDataList = [];
let imageViewerLastActive = null;
let imageViewerImages = [];
let imageViewerIndex = 0;
let editingItemRoomId = '';
let editingItemIndex = -1;
let maintenanceChart = null;
if (document.documentElement) {
    document.documentElement.classList.add('room-hydrating');
}
const BUILDING_ID = String(document.body?.dataset?.buildingId || 'A').trim().toUpperCase();
const API_URL = 'api.php';
const DATE_STORAGE_KEY = `room_snapshot_date_${BUILDING_ID.toLowerCase()}_v1`;
const DATE_RANGE_START_STORAGE_KEY = `room_snapshot_range_start_${BUILDING_ID.toLowerCase()}_v1`;
const DATE_RANGE_END_STORAGE_KEY = `room_snapshot_range_end_${BUILDING_ID.toLowerCase()}_v1`;
const ADMIN_PASSWORD_STORAGE_KEY = 'admin_password_v1';
const DEFAULT_ADMIN_PASSWORD = '1234';

function getAdminPassword() {
    const saved = String(localStorage.getItem(ADMIN_PASSWORD_STORAGE_KEY) || '').trim();
    return saved.length >= 4 ? saved : '';
}

async function syncAdminPasswordFromDb() {
    const res = await apiRequest('get_admin_password');
    const password = String(res?.password || '').trim();
    if (password.length >= 4) {
        localStorage.setItem('admin_password_v1', password);
    }
}

let maintTaskLogCache = [];
let quickSaveInFlight = 0;
let quickSidebarSyncTimer = null;

function scheduleQuickSidebarSync() {
    if (quickSidebarSyncTimer) {
        clearTimeout(quickSidebarSyncTimer);
    }
    quickSidebarSyncTimer = window.setTimeout(async () => {
        // Wait until quick-save requests settle, then refresh once.
        if (quickSaveInFlight > 0) {
            scheduleQuickSidebarSync();
            return;
        }
        await loadMaintenanceTasksFromDb();
        if (typeof window.renderServiceSidebar === 'function') {
            window.renderServiceSidebar();
        }
    }, 260);
}

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
if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedSnapshotDate)) {
    selectedSnapshotDate = getTodayLocal();
    localStorage.setItem(DATE_STORAGE_KEY, selectedSnapshotDate);
}
let selectedRangeStartDate = localStorage.getItem(DATE_RANGE_START_STORAGE_KEY) || selectedSnapshotDate;
let selectedRangeEndDate = localStorage.getItem(DATE_RANGE_END_STORAGE_KEY) || selectedSnapshotDate;

function syncSelectedDateRange() {
    let start = String(selectedRangeStartDate || '').trim();
    let end = String(selectedRangeEndDate || '').trim();
    if (!start) start = selectedSnapshotDate;
    if (!end) end = selectedSnapshotDate;
    if (start > end) {
        const t = start;
        start = end;
        end = t;
    }
    selectedRangeStartDate = start;
    selectedRangeEndDate = end;
    selectedSnapshotDate = end;
    localStorage.setItem(DATE_STORAGE_KEY, selectedSnapshotDate);
    localStorage.setItem(DATE_RANGE_START_STORAGE_KEY, selectedRangeStartDate);
    localStorage.setItem(DATE_RANGE_END_STORAGE_KEY, selectedRangeEndDate);
}

function isDateRangeMode() {
    return selectedRangeStartDate !== selectedRangeEndDate;
}

function dateInSelectedRange(dateISO) {
    const d = String(dateISO || '').trim();
    if (!d) return false;
    return d >= selectedRangeStartDate && d <= selectedRangeEndDate;
}

function setSelectedDateRange(startISO, endISO) {
    selectedRangeStartDate = String(startISO || '').slice(0, 10);
    selectedRangeEndDate = String(endISO || '').slice(0, 10);
    syncSelectedDateRange();
}

function setSelectedSingleDate(dateISO) {
    const d = String(dateISO || '').slice(0, 10);
    setSelectedDateRange(d, d);
}

function isTodayEditableSelection() {
    return !isDateRangeMode() && selectedSnapshotDate === getTodayLocal();
}

syncSelectedDateRange();

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

function getItemCategoryUsage(categoryName) {
    const normalizedTarget = normalizeCategoryName(categoryName);
    const map = loadRoomInfoMap() || {};
    let itemCount = 0;
    const roomIds = [];

    Object.entries(map).forEach(([roomId, items]) => {
        if (!Array.isArray(items) || !items.length) return;
        const usedInRoom = items.filter(item => normalizeCategoryName(item?.category) === normalizedTarget).length;
        if (usedInRoom > 0) {
            itemCount += usedInRoom;
            roomIds.push(String(roomId).trim());
        }
    });

    return {
        itemCount,
        roomCount: roomIds.length,
        roomIds
    };
}

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

    await loadRoomInfoMapFromDb();
    const usage = getItemCategoryUsage(categoryName);

    if (usage.itemCount > 0) {
        const previewRooms = usage.roomIds.slice(0, 5).join(', ');
        const moreText = usage.roomCount > 5 ? ', ...' : '';
        const warningMsg =
            `This category is still used by ${usage.itemCount} item(s) in ${usage.roomCount} room(s).\n` +
            `Rooms: ${previewRooms}${moreText}\n\n` +
            `Delete category "${categoryName}" anyway?`;
        if (!confirm(warningMsg)) return;
    } else {
        if (!confirm(`Delete category "${categoryName}" ?`)) return;
    }

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

async function loadRoomInfoMapFromDb() {
    const snapshotDate = isDateRangeMode() ? selectedRangeEndDate : selectedSnapshotDate;
    const action = (snapshotDate === getTodayLocal()) ? 'get_room_items' : 'get_room_items_snapshot';
    const payload = {
        building: BUILDING_ID,
        snapshot_date: snapshotDate
    };
    const res = await apiRequest(action, payload);
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
        snapshot_date: getTodayLocal(),
        items_json: JSON.stringify(items)
    });
    return !!res;
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
    const isAdmin = localStorage.getItem("isAdmin") === "true";
    let items = map[roomId] || [];

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

        const isTextOnly = item?.textOnly === 1 || item?.textOnly === true || String(item?.text_only || '') === '1';
        const itemImages = Array.isArray(item?.images)
            ? item.images.map(v => String(v || '').trim()).filter(Boolean)
            : [];
        const itemImage = itemImages[0] || ((item.image && item.image.trim() !== '') ? item.image : '');
        const card = document.createElement('div');
        card.className = isTextOnly
            ? 'item-note-sheet sm:col-span-2 lg:col-span-3'
            : 'item-card bg-white rounded-2xl overflow-hidden shadow-lg border border-slate-100 cursor-pointer';
        
        // รูปภาพ
        let imgHtml = '';
        if (itemImage && itemImage.trim() !== "") {
            imgHtml = `<img src="${itemImage}" class="w-full h-full object-cover" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                       <div class="hidden absolute inset-0 items-center justify-center bg-slate-100"><span class="text-5xl">${icon}</span></div>`;
        } else {
            imgHtml = `<div class="absolute inset-0 flex items-center justify-center bg-slate-100"><span class="text-5xl">${icon}</span></div>`;
        }
        const deleteButtonHtml = isAdmin
       ? `<button type="button" onclick="deleteInfoItem('${roomId}', ${realIndex}); return false;" class="w-full bg-red-50 hover:bg-red-100 text-red-600 py-2 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Delete
                </button>`
            : '';
        const editButtonHtml = isAdmin
            ? `<button type="button" onclick="editInfoItem('${roomId}', ${realIndex}); return false;" class="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-600 py-2 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5h2M5 5h2m10 0h2M5 12h14M5 19h14"/></svg>
                    Edit
                </button>`
            : '';
        const actionsHtml = isAdmin
            ? `<div class="grid grid-cols-2 gap-2">${editButtonHtml}${deleteButtonHtml}</div>`
            : '';

        if (isTextOnly) {
            card.innerHTML = `
                <div class="rounded-2xl bg-slate-50 border border-slate-200 p-5">
                    <div class="text-xs font-semibold text-slate-500 mb-2">${item.name || 'ข้อความ'}</div>
                    <div class="min-h-[180px] text-[15px] leading-7 text-slate-700 whitespace-pre-wrap break-words">${noteText || '-'}</div>
                    <div class="mt-4 max-w-[320px]">${actionsHtml}</div>
                </div>
            `;
            listEl.appendChild(card);
            return;
        }

        card.innerHTML = `
            <button type="button" class="item-preview-trigger relative h-36 w-full bg-gradient-to-br from-slate-100 to-slate-200 border-none p-0">
                ${imgHtml}
                <span class="category-badge absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/90 backdrop-blur-sm text-slate-700 shadow-sm">
                    ${icon} ${displayCategory}
                </span>
                ${itemImages.length > 1 ? `<span class="absolute left-3 top-3 px-2 py-1 rounded-full text-[11px] font-bold bg-black/60 text-white">${itemImages.length} Photos</span>` : ''}
            </button>
            <div class="p-4">
                <h3 class="font-bold text-slate-800 text-lg mb-1 truncate">${item.name}</h3>
                <p class="text-slate-500 text-sm flex items-center gap-1.5 mb-4">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
                    ${dimText}
                </p>
                ${noteHtml}
                ${actionsHtml}
            </div>
        `;
        const previewBtn = card.querySelector('.item-preview-trigger');
        if (previewBtn) {
            if (itemImage && itemImage.trim() !== '') {
                previewBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    openImageViewer(itemImages.length ? itemImages : [itemImage], item.name || `Room ${roomId}`);
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
    if (!isTodayEditableSelection()) {
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
    if (!isTodayEditableSelection()) {
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

function updateImageViewerFrame(caption = '') {
    const img = el('imageViewerImg');
    const captionEl = el('imageViewerCaption');
    const indexEl = el('imageViewerIndex');
    const prevBtn = el('imageViewerPrev');
    const nextBtn = el('imageViewerNext');
    if (!img) return;
    const total = imageViewerImages.length;
    if (!total) return;
    imageViewerIndex = Math.max(0, Math.min(imageViewerIndex, total - 1));
    img.src = imageViewerImages[imageViewerIndex] || '';
    if (captionEl) captionEl.textContent = String(caption || '').trim();
    if (indexEl) indexEl.textContent = `${imageViewerIndex + 1}/${total}`;
    if (prevBtn) prevBtn.disabled = total <= 1;
    if (nextBtn) nextBtn.disabled = total <= 1;
}

window.openImageViewer = function(src, caption = '') {
    const modal = el('imageViewerModal');
    if (!modal) return;
    const list = Array.isArray(src) ? src : [src];
    const cleaned = list.map(v => String(v || '').trim()).filter(Boolean);
    if (!cleaned.length) return;

    imageViewerLastActive = document.activeElement;
    imageViewerImages = cleaned;
    imageViewerIndex = 0;
    updateImageViewerFrame(caption);
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
    const indexEl = el('imageViewerIndex');
    if (indexEl) indexEl.textContent = '';
    imageViewerImages = [];
    imageViewerIndex = 0;
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
        if (modal.classList.contains('hidden')) return;
        if (e.key === 'ArrowLeft' && imageViewerImages.length > 1) {
            imageViewerIndex = (imageViewerIndex - 1 + imageViewerImages.length) % imageViewerImages.length;
            updateImageViewerFrame(el('imageViewerCaption')?.textContent || '');
        }
        if (e.key === 'ArrowRight' && imageViewerImages.length > 1) {
            imageViewerIndex = (imageViewerIndex + 1) % imageViewerImages.length;
            updateImageViewerFrame(el('imageViewerCaption')?.textContent || '');
        }
    });

    const prevBtn = el('imageViewerPrev');
    const nextBtn = el('imageViewerNext');
    if (prevBtn) prevBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (imageViewerImages.length <= 1) return;
        imageViewerIndex = (imageViewerIndex - 1 + imageViewerImages.length) % imageViewerImages.length;
        updateImageViewerFrame(el('imageViewerCaption')?.textContent || '');
    });
    if (nextBtn) nextBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (imageViewerImages.length <= 1) return;
        imageViewerIndex = (imageViewerIndex + 1) % imageViewerImages.length;
        updateImageViewerFrame(el('imageViewerCaption')?.textContent || '');
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
    editingItemRoomId = '';
    editingItemIndex = -1;
    itemTextOnlyMode = false;
    if (typeof window.applyAddItemModeUI === 'function') window.applyAddItemModeUI();
    const titleEl = el('add-item-title');
    const saveBtn = el('save-item-btn');
    if (titleEl) titleEl.textContent = 'Add New Item';
    if (saveBtn) saveBtn.textContent = 'Save Item';
    currentImageDataList = [];
    currentImageData = '';
    const fileInput = el('item-image-file'); if (fileInput) fileInput.value = '';
    if (typeof window.updateImagePreview === 'function') window.updateImagePreview(currentImageData);
}

function parseDimensionValue(raw) {
    const text = String(raw || '').trim();
    if (!text) return { value: '', unit: 'cm' };
    const m = text.match(/^(.+?)\s*(cm|m|mm|Inch|ft|Sq\.m\.)$/i);
    if (!m) return { value: text, unit: 'cm' };
    return { value: String(m[1] || '').trim(), unit: String(m[2] || 'cm') };
}

window.editItem = function(roomId, index) {
    if (!isTodayEditableSelection()) { alert("View only (past date)."); return; }
    if (localStorage.getItem("isAdmin") !== "true") { alert("Admin only."); return; }
    const rid = String(roomId || '').trim();
    if (!rid || !Number.isInteger(index) || index < 0) return;
    const map = loadRoomInfoMap();
    const list = Array.isArray(map[rid]) ? map[rid] : [];
    const item = list[index];
    if (!item) return;

    const isTextOnly = item?.textOnly === 1 || item?.textOnly === true || String(item?.text_only || '') === '1';
    if (isTextOnly) {
        window.openAddTextItemModal({ roomId: rid, index, item });
        return;
    }

    window.openAddItemModal();
    editingItemRoomId = rid;
    editingItemIndex = index;
    itemTextOnlyMode = false;
    if (typeof window.applyAddItemModeUI === 'function') window.applyAddItemModeUI();

    const titleEl = el('add-item-title');
    const saveBtn = el('save-item-btn');
    if (titleEl) titleEl.textContent = 'Edit Item';
    if (saveBtn) saveBtn.textContent = 'Update Item';

    const nameEl = el('item-name-input');
    const noteEl = el('item-note-input');
    const catEl = el('item-category-input');
    const wEl = el('item-width-input');
    const hEl = el('item-height-input');
    const wuEl = el('item-width-unit');
    const huEl = el('item-height-unit');

    if (nameEl) nameEl.value = String(item.name || '');
    if (noteEl) noteEl.value = String(item.note || '');
    if (catEl) catEl.value = String(item.category || catEl.value || '');

    const wParsed = parseDimensionValue(item.width);
    const hParsed = parseDimensionValue(item.height);
    if (wEl) wEl.value = wParsed.value;
    if (hEl) hEl.value = hParsed.value;
    if (wuEl) wuEl.value = wParsed.unit;
    if (huEl) huEl.value = hParsed.unit;

    const images = Array.isArray(item?.images)
        ? item.images.map(v => String(v || '').trim()).filter(Boolean)
        : [];
    const firstImage = images[0] || String(item.image || '').trim();
    currentImageDataList = images.length ? images : (firstImage ? [firstImage] : []);
    currentImageData = currentImageDataList[0] || '';
    if (typeof window.updateImagePreview === 'function') window.updateImagePreview(currentImageData);
}

window.openAddTextItemModal = function(options = null) {
    window.openAddItemModal();
    itemTextOnlyMode = true;
    if (typeof window.applyAddItemModeUI === 'function') window.applyAddItemModeUI();
    const titleEl = el('add-item-title');
    const saveBtn = el('save-item-btn');
    const nameInput = el('item-name-input');
    if (options && options.roomId && Number.isInteger(options.index)) {
        editingItemRoomId = String(options.roomId);
        editingItemIndex = options.index;
        const item = options.item || {};
        if (nameInput) nameInput.value = String(item.name || 'ข้อความ');
        const noteInput = el('item-note-input');
        if (noteInput) noteInput.value = String(item.note || '');
        if (titleEl) titleEl.textContent = 'Edit Note';
        if (saveBtn) saveBtn.textContent = 'Update Note';
    } else {
        if (nameInput) nameInput.value = 'ข้อความ';
        if (titleEl) titleEl.textContent = 'Add Note';
        if (saveBtn) saveBtn.textContent = 'Save Note';
    }
    const noteInput = el('item-note-input');
    if (noteInput) noteInput.focus();
}

window.editInfoItem = function(roomId, index) {
    if (!isTodayEditableSelection()) { alert("View only (past date)."); return; }
    if (localStorage.getItem("isAdmin") !== "true") { alert("Admin only."); return; }
    const rid = String(roomId || '').trim();
    if (!rid || !Number.isInteger(index) || index < 0) return;
    const map = loadRoomInfoMap();
    const list = Array.isArray(map[rid]) ? map[rid] : [];
    const item = list[index];
    if (!item) return;
    window.editItem(rid, index);
}

window.closeAddItemModal = function() {
    document.getElementById('addItemModal').classList.add('hidden');
}

window.applyAddItemModeUI = function() {
    const imageSection = el('item-image-section');
    const sizeSection = el('item-size-section');
    const categorySection = el('item-category-section');
    const nameSection = el('item-name-section');
    const titleEl = el('add-item-title');
    const noteInput = el('item-note-input');
    const nameInput = el('item-name-input');
    const saveBtn = el('save-item-btn');

    if (imageSection) imageSection.classList.toggle('hidden', itemTextOnlyMode);
    if (sizeSection) sizeSection.classList.toggle('hidden', itemTextOnlyMode);
    if (categorySection) categorySection.classList.toggle('hidden', itemTextOnlyMode);
    if (nameSection) nameSection.classList.toggle('hidden', itemTextOnlyMode);

    if (noteInput) {
        noteInput.rows = itemTextOnlyMode ? 14 : 3;
        noteInput.placeholder = itemTextOnlyMode
            ? 'พิมพ์ข้อความที่ต้องการบันทึก'
            : 'Enter any additional notes about this item';
    }
    if (nameInput) {
        nameInput.placeholder = 'e.g., Bed';
    }
    if (titleEl) titleEl.textContent = itemTextOnlyMode ? 'Add Note' : 'Add New Item';
    if (saveBtn) saveBtn.textContent = itemTextOnlyMode ? 'Save Note' : 'Save Item';
};

window.toggleAddItemTextMode = function() {
    itemTextOnlyMode = !itemTextOnlyMode;
    window.applyAddItemModeUI();
    if (itemTextOnlyMode) {
        const noteInput = el('item-note-input');
        if (noteInput) noteInput.focus();
    }
}

window.updateImagePreview = function(url) {
    const img = el('preview-img');
    const placeholder = el('image-placeholder');
    const countLabel = el('item-image-count');
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
    if (countLabel) {
        const n = Array.isArray(currentImageDataList) ? currentImageDataList.length : 0;
        countLabel.textContent = n > 1 ? `${n} images selected` : (n === 1 ? '1 image selected' : '');
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
        if (dateISO === resolvedDate) return 'resolved';
        return null;
    }

    return null;
}

function getTaskStateInRange(task, startISO, endISO, todayISO) {
    const reportedDate = String(task?.reportedDate || task?.reported_date || '').trim();
    const resolvedDate = String(task?.resolvedDate || task?.resolved_date || '').trim();
    const status = String(task?.status || 'pending').trim();
    if (!reportedDate || !startISO || !endISO) return null;
    if (reportedDate > endISO) return null;

    if (status === 'pending') {
        const cappedEnd = endISO > todayISO ? todayISO : endISO;
        return reportedDate <= cappedEnd ? 'pending' : null;
    }

    if (status === 'resolved') {
        if (resolvedDate && resolvedDate >= startISO && resolvedDate <= endISO) return 'resolved';
        if (!resolvedDate) {
            const cappedEnd = endISO > todayISO ? todayISO : endISO;
            return reportedDate <= cappedEnd ? 'pending' : null;
        }
        const hasPendingWindow = reportedDate <= endISO && resolvedDate > startISO;
        return hasPendingWindow ? 'pending' : null;
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

        const state = isDateRangeMode()
            ? getTaskStateInRange(task, selectedRangeStartDate, selectedRangeEndDate, todayISO)
            : getTaskStateOnDate(task, selectedSnapshotDate, todayISO);
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
function getLatestResolvedRoomIds(typeFilters = null) {
    const log = readMaintTaskLog();
    const resolvedRoomIds = new Set();
    const hasTypeFilter = typeFilters instanceof Set && typeFilters.size > 0;

    log.forEach(task => {
        const roomId = String(task?.roomId || '').trim();
        const taskType = String(task?.type || '').trim();
        const resolvedDate = String(task?.resolvedDate || task?.resolved_date || '').trim();
        if (!roomId) return;
        if (hasTypeFilter && !typeFilters.has(taskType)) return;

        const isResolvedInRange = isDateRangeMode()
            ? dateInSelectedRange(resolvedDate)
            : (resolvedDate === selectedSnapshotDate);
        if (task.status === 'resolved' && isResolvedInRange) {
            buildRoomIdVariants(roomId).forEach(id => resolvedRoomIds.add(id));
        }
    });
    return resolvedRoomIds;
}

function getFilteredRoomStateMap(typeFilters = null) {
    const log = readMaintTaskLog();
    const todayISO = getTodayLocal();
    const pendingMap = new Map();
    const resolvedSet = new Set();
    const hasTypeFilter = typeFilters instanceof Set && typeFilters.size > 0;

    log.forEach(task => {
        const roomId = String(task?.roomId || '').trim();
        const taskType = String(task?.type || '').trim();
        if (!roomId || !taskType) return;
        if (hasTypeFilter && !typeFilters.has(taskType)) return;

        const state = isDateRangeMode()
            ? getTaskStateInRange(task, selectedRangeStartDate, selectedRangeEndDate, todayISO)
            : getTaskStateOnDate(task, selectedSnapshotDate, todayISO);
        if (!state) return;

        const variants = buildRoomIdVariants(roomId);
        if (state === 'resolved') {
            variants.forEach(id => resolvedSet.add(id));
            return;
        }

        const icon = getMaintIconByName(taskType) || '🔧';
        const note = String(task?.note || '').trim();
        variants.forEach(id => {
            if (!pendingMap.has(id)) {
                pendingMap.set(id, { icon, note, type: taskType });
            }
        });
    });

    return { pendingMap, resolvedSet };
}

function buildRoomIdVariants(rawRoomId) {
    const roomId = String(rawRoomId || '').trim();
    if (!roomId) return [];
    const variants = new Set([roomId]);

    const compact = roomId.replace(/\s+/g, '');
    if (compact) variants.add(compact);

    const normalizedRange = roomId.replace(/\s*[-–]\s*/g, '-');
    if (normalizedRange) variants.add(normalizedRange);

    const prefix = (roomId.match(/^\s*([0-9]+)\b/) || [])[1];
    if (prefix) variants.add(prefix);

    const range = (roomId.match(/([0-9]+)\s*[-–]\s*([0-9]+)/) || []);
    if (range[1]) {
        variants.add(range[1]);
        if (range[2]) variants.add(range[2]);
        if (range[2]) variants.add(`${range[1]}-${range[2]}`);
    }

    const digitsOnly = roomId.replace(/[^0-9]/g, '');
    if (digitsOnly) variants.add(digitsOnly);

    return Array.from(variants);
}

function isResolvedRoomMatch(resolvedSet, roomId) {
    if (!(resolvedSet instanceof Set) || !roomId) return false;
    return buildRoomIdVariants(roomId).some(id => resolvedSet.has(id));
}

function renderResolvedThumbs() {
    if (activeFilters.size === 0) {
        getRoomElements().forEach(room => {
            room.querySelectorAll('.resolved-thumb').forEach(el => el.remove());
        });
        return;
    }
    const resolvedRoomIds = getLatestResolvedRoomIds(activeFilters);
    const rooms = getRoomElements();
    rooms.forEach(room => {
        room.querySelectorAll('.resolved-thumb').forEach(el => el.remove());
        const roomId = String(getRoomId(room) || '').trim();
        if (!roomId || !isResolvedRoomMatch(resolvedRoomIds, roomId)) return;
        room.insertAdjacentHTML('beforeend', '<div class="resolved-thumb" title="Resolved"></div>');
    });
}

window.resolveMaintTaskFromDashboard = function(taskId) {
    if (!taskId) return;
    if (!isTodayEditableSelection()) {
        alert("View only (past date).");
        return;
    }

    if (!confirm('Mark this maintenance task as resolved?')) return;

    const task = readMaintTaskLog().find(t => String(t?.id || '') === String(taskId));
    const roomId = String(task?.roomId || '').trim();
    if (roomId) {
        getRoomElements().forEach(room => {
            const rid = String(getRoomId(room) || '').trim();
            if (!rid) return;
            if (!buildRoomIdVariants(rid).includes(roomId) && !buildRoomIdVariants(roomId).includes(rid)) return;
            room.setAttribute('data-maint', '');
            room.setAttribute('data-maint-note', '');
            room.querySelectorAll('.maint-icon,.filter-icon').forEach(el => el.remove());
        });
    }
    if (task) {
        task.status = 'resolved';
        task.resolvedDate = getTodayLocal();
        task.resolved_date = getTodayLocal();
    }
    if (typeof renderServiceSidebar === 'function') renderServiceSidebar();
    if (typeof window.updateDashboardCharts === 'function') window.updateDashboardCharts();

    (async () => {
        const res = await apiRequest('resolve_maintenance_task', {
            building: BUILDING_ID,
            task_id: taskId
        });
        if (!res) {
            await loadMaintenanceTasksFromDb();
            if (activeFilters.size > 0) applyActiveFiltersToRooms();
            if (typeof renderServiceSidebar === 'function') renderServiceSidebar();
            if (typeof window.updateDashboardCharts === 'function') window.updateDashboardCharts();
            return;
        }
        // lightweight refresh in background, keep click response instant
        window.setTimeout(async () => {
            await loadMaintenanceTasksFromDb();
            if (activeFilters.size > 0) applyActiveFiltersToRooms();
            if (typeof renderServiceSidebar === 'function') renderServiceSidebar();
            if (typeof window.updateDashboardCharts === 'function') window.updateDashboardCharts();
        }, 450);
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
            let displayState = null; // 'pending' | 'resolved'
            if (isDateRangeMode()) {
                displayState = getTaskStateInRange(task, selectedRangeStartDate, selectedRangeEndDate, todayISO);
            } else {
                // Rule 1: selectedSnapshotDate < reportedDate -> hide
                if (selectedSnapshotDate < reportedDate) return;
                if (status === 'pending') {
                    if (selectedSnapshotDate >= reportedDate && selectedSnapshotDate <= todayISO) {
                        displayState = 'pending';
                    }
                } else if (status === 'resolved') {
                    if (selectedSnapshotDate === resolvedDate) {
                        displayState = 'resolved';
                    } else if (selectedSnapshotDate >= reportedDate && selectedSnapshotDate < resolvedDate) {
                        displayState = 'pending';
                    }
                }
            }

            if (!displayState) return;

            taskCount++;

            const icon = typeof getMaintIconByName === 'function' ? (getMaintIconByName(task.type) || '🔧') : '🔧';
            const iconColor = typeof getMaintColorByIcon === 'function' ? getMaintColorByIcon(icon) : '#f59e0b';
            const noteText = (task.note || '').trim() || '-';
            const canResolveFromDashboard = displayState === 'pending'
                && status === 'pending'
                && !isDateRangeMode()
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
                maintTaskCountBadge.className = "bg-green-100 text-green-600 px-3 py-1 rounded-full text-xs font-bold inline-flex items-center justify-center whitespace-nowrap leading-none";
                maintTaskCountBadge.innerText = "✅ All Clear (ไม่มีงานค้าง)";
                maintTableBody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-gray-400 font-medium">ไม่มีรายการแจ้งซ่อมในวันที่เลือก</td></tr>`;
            } else {
                maintTaskCountBadge.className = "bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold inline-flex items-center justify-center whitespace-nowrap leading-none";
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

    const readFileAsDataUrl = (file) => new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
    });

    const handleFiles = async (files) => {
        const list = Array.from(files || []);
        const imageFiles = list.filter(file => file && file.type && file.type.startsWith('image/'));
        if (!imageFiles.length) return;
        const dataUrls = await Promise.all(imageFiles.map(readFileAsDataUrl));
        const valid = dataUrls.filter(Boolean);
        if (!valid.length) return;
        currentImageDataList = [...currentImageDataList, ...valid].slice(0, 20);
        currentImageData = currentImageDataList[0] || '';
        updateImagePreview(currentImageData);
    };

    fileInput.addEventListener('change', async (e) => {
        await handleFiles(e.target.files || []);
    });

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
        const files = e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files : [];
        handleFiles(files);
    });
}

// 🔥 บันทึกข้อมูล (ทำงานกับ HTML ใหม่แน่นอน)
window.saveCanvaItem = async function() {
    if (!currentViewingRoom) return;
    if (!isTodayEditableSelection()) { alert("View only (past date)."); return; }
 if (localStorage.getItem("isAdmin") !== "true") { alert("Admin only."); return; }
    const nameEl = el('item-name-input');
    const widthEl = el('item-width-input');
    const heightEl = el('item-height-input');
    
    // 1. เพิ่มการดึงค่าจาก Dropdown หน่วย (ที่เราจะไปเพิ่ม id นี้ใน HTML)
    const widthUnitEl = el('item-width-unit'); 
    const heightUnitEl = el('item-height-unit');

    let name = nameEl ? String(nameEl.value || '').trim() : '';
    
    // 2. แก้ไขการเก็บค่า: เอาตัวเลขมาต่อกับหน่วยที่เลือกก่อนบันทึก
    // เช่น ถ้ากรอก 150 และเลือก cm จะได้ "150 cm"
    const width = (itemTextOnlyMode || !(widthEl && widthEl.value)) ? '' : `${widthEl.value} ${widthUnitEl.value}`;
    const height = (itemTextOnlyMode || !(heightEl && heightEl.value)) ? '' : `${heightEl.value} ${heightUnitEl.value}`;
    
    const noteEl = el('item-note-input');
    const catEl = el('item-category-input');
    const note = noteEl ? String(noteEl.value || '').trim() : '';
    const image = currentImageDataList[0] || currentImageData || '';
    const category = itemTextOnlyMode
        ? 'อื่นๆ'
        : (catEl ? String(catEl.value || '') : (getItemCategories()[0]?.name || 'อื่นๆ'));

    if (itemTextOnlyMode && !note) { alert("Please enter note text."); return; }
    if (itemTextOnlyMode && !name) name = 'ข้อความ';
    if (!name) { alert("Please enter an item name."); return; }

    const roomId = getRoomId(currentViewingRoom);
    const map = loadRoomInfoMap();
    if (!map[roomId]) map[roomId] = [];

    // 3. บันทึกข้อมูลที่มีหน่วยติดไปด้วยลงใน Database/Storage
    const itemPayload = {
        name,
        width,
        height,
        note,
        image: itemTextOnlyMode ? '' : image,
        images: itemTextOnlyMode ? [] : currentImageDataList.slice(),
        category,
        textOnly: itemTextOnlyMode ? 1 : 0
    };
    if (editingItemRoomId === roomId && editingItemIndex >= 0 && map[roomId][editingItemIndex]) {
        map[roomId][editingItemIndex] = { ...map[roomId][editingItemIndex], ...itemPayload };
    } else {
        map[roomId].push(itemPayload);
    }
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
   editingItemRoomId = '';
   editingItemIndex = -1;

// ✅ บังคับให้ DOM อัปเดตแล้วค่อย render
requestAnimationFrame(() => renderRoomInfoList(roomId));
setTimeout(() => renderRoomInfoList(roomId), 0);
}
window.deleteInfoItem = function(roomId, index) {
  if (!isTodayEditableSelection()) { alert("View only (past date)."); return; }
  if (localStorage.getItem("isAdmin") !== "true") { alert("Admin only."); return; }
  if (!confirm("Confirm delete this item?")) return;

  const map = loadRoomInfoMap();
  if (!Array.isArray(map[roomId])) return;

  map[roomId].splice(index, 1);
  roomInfoMapCache = map;

  // Optimistic UI: remove card immediately, save in background
  renderRoomInfoList(roomId);

  queueSaveRoomInfoMapForRoom(roomId).then((saved) => {
    if (!saved) {
      alert("Cannot save item list. Please try again.");
    }
  });
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
    const { pendingMap } = getFilteredRoomStateMap(activeFilters);

    allRooms.forEach(room => {
        // remove only filter-related markers/icons, keep persisted maint-icon from DB
        room.querySelectorAll('.filter-icon').forEach(el => el.remove());
        room.querySelectorAll('.maint-icon.filter-maint-icon').forEach(el => el.remove());
        // reset persisted maintenance icons visibility before applying filter
        room.querySelectorAll('.maint-icon:not(.filter-maint-icon)').forEach(el => {
            el.style.removeProperty('display');
        });
    });

    if (activeFilters.size === 0) {
        return;
    }

    allRooms.forEach(room => {
        const roomId = String(getRoomId(room) || '').trim();
        if (!roomId) {
            // When a Service Status filter is active, hide non-matching persisted icons.
            room.querySelectorAll('.maint-icon:not(.filter-maint-icon)').forEach(el => {
                el.style.setProperty('display', 'none', 'important');
            });
            return;
        }

        let pendingEntry = null;
        const variants = buildRoomIdVariants(roomId);
        for (const id of variants) {
            if (pendingMap.has(id)) {
                pendingEntry = pendingMap.get(id);
                break;
            }
        }
        if (!pendingEntry) {
            room.querySelectorAll('.maint-icon:not(.filter-maint-icon)').forEach(el => {
                el.style.setProperty('display', 'none', 'important');
            });
            return;
        }

        room.querySelectorAll('.maint-icon:not(.filter-maint-icon)').forEach(el => {
            el.style.setProperty('display', 'none', 'important');
        });
        const icon = pendingEntry.icon || "🔧";
        room.insertAdjacentHTML('beforeend', `<span class="filter-icon" aria-hidden="true">${icon}</span>`);
        const label = pendingEntry.note ? `Task: ${pendingEntry.note}` : 'Task: Unspecified';
        room.insertAdjacentHTML('beforeend', `<div class="maint-icon filter-maint-icon" data-info="${label}">${icon}</div>`);
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

function initMobileTopNavMenu() {
    const toggleBtn = document.getElementById('topNavToggle');
    const menu = document.getElementById('topNavMenu');
    const header = document.querySelector('.page-navbar');
    if (!toggleBtn || !menu || !header) return;

    const mobileQuery = window.matchMedia('(max-width: 768px)');

    const closeMenu = () => {
        if (!mobileQuery.matches) return;
        menu.classList.remove('is-open');
        document.body.classList.remove('mobile-top-nav-open');
        toggleBtn.setAttribute('aria-expanded', 'false');
    };

    const openMenu = () => {
        if (!mobileQuery.matches) return;
        document.body.classList.remove('mobile-service-drawer-open');
        document.body.classList.remove('mobile-roomtype-drawer-open');
        menu.classList.add('is-open');
        document.body.classList.add('mobile-top-nav-open');
        toggleBtn.setAttribute('aria-expanded', 'true');
    };

    toggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        if (expanded) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    document.addEventListener('click', (event) => {
        if (!mobileQuery.matches) return;
        const clickedInside = header.contains(event.target);
        if (!clickedInside) closeMenu();
    });

    window.addEventListener('resize', () => {
        if (!mobileQuery.matches) {
            menu.classList.remove('is-open');
            document.body.classList.remove('mobile-top-nav-open');
            toggleBtn.setAttribute('aria-expanded', 'false');
        } else {
            closeMenu();
        }
    });
}

function initMobileSwipeToHome() {
    const mobileQuery = window.matchMedia('(max-width: 768px)');
    let startX = 0;
    let startY = 0;
    let tracking = false;

    document.addEventListener('touchstart', (event) => {
        if (!mobileQuery.matches) return;
        const touch = event.changedTouches && event.changedTouches[0];
        if (!touch) return;

        // Trigger only when user starts swiping from left edge.
        if (touch.clientX > 26) {
            tracking = false;
            return;
        }
        startX = touch.clientX;
        startY = touch.clientY;
        tracking = true;
    }, { passive: true });

    document.addEventListener('touchend', (event) => {
        if (!mobileQuery.matches || !tracking) return;
        tracking = false;
        const touch = event.changedTouches && event.changedTouches[0];
        if (!touch) return;

        const deltaX = touch.clientX - startX;
        const deltaY = Math.abs(touch.clientY - startY);
        if (deltaX >= 92 && deltaY <= 72) {
            window.location.href = 'index.html';
        }
    }, { passive: true });
}

// --- Init ---
document.addEventListener('DOMContentLoaded', async function() {
    // Do not block first paint for Service Status.
    syncAdminPasswordFromDb();
    syncItemCategoriesFromDb().then(() => {
        if (typeof renderServiceSidebar === 'function') renderServiceSidebar();
    });
    document.body.classList.remove('show-filter-icons');
    let isEditMode = false;
    const editModeBtn = document.getElementById('edit-mode-btn');
    const isAdminUser = () => localStorage.getItem("isAdmin") === "true";
    initImagePicker();
    initImageViewer();
    initMobileTopNavMenu();
    initMobileSwipeToHome();
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
            if (!isTodayEditableSelection()) { alert("View only (past date)."); return; }
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

            // 3. วาดไอคอนหรือลบไอคอน (Real-time UI) ด้วยสไตล์หลักของระบบ
            const existingBadges = el.querySelectorAll('.quick-badge-icon, .maint-icon');
            existingBadges.forEach(badge => badge.remove());

            if (newStatus !== '') {
                const iconText = getMaintIcon(newStatus) || '🔧';
                const noteText = String(el.getAttribute('data-maint-note') || '').trim();
                const label = noteText ? `Task: ${noteText}` : 'Task: Unspecified';
                el.insertAdjacentHTML('beforeend', `<div class="maint-icon" data-info="${label}">${iconText}</div>`);
            }

            // 4. แอบส่งข้อมูลไปเซฟใน Database หลังบ้าน (ไม่ต้องรอหน้าจอโหลด)
            const payload = {
                building: typeof BUILDING_ID !== 'undefined' ? BUILDING_ID : 'A',
                room_id: roomId,
                guest_name: (el.getAttribute('data-name') || '').trim(),
                room_type: el.getAttribute('data-type') || '',
                maint_status: newStatus,
                maint_note: newStatus ? String(el.getAttribute('data-maint-note') || '').trim() : '',
                quick_toggle_remove: newStatus === '' ? 1 : 0,
                ap_installed: el.getAttribute('data-ap') === 'true' ? 1 : 0,
                ap_install_date: el.getAttribute('data-ap-date') || '',
                room_image: getRoomImage(el)
            };

            quickSaveInFlight += 1;
            apiRequest('save_room_state', payload)
                .then(() => apiRequest('save_room_snapshot', { ...payload, snapshot_date: getTodayLocal() }))
                .catch((error) => {
                    console.error('Save error:', error);
                })
                .finally(() => {
                    quickSaveInFlight = Math.max(0, quickSaveInFlight - 1);
                    scheduleQuickSidebarSync();
                });
             
            return; // จบการทำงานโหมด Quick
        }

        // ==========================================
        // 🏠 โหมดการคลิกปกติ (ดูรายละเอียดห้อง)
        // ==========================================
        if (typeof selectedSnapshotDate !== 'undefined' && !isTodayEditableSelection()) { 
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
        if (!isTodayEditableSelection()) { 
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

        if (maintStatus && (activeFilters.size > 0 || (typeof quickModeActive !== 'undefined' && quickModeActive))) {
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
            if (maintStatus && (activeFilters.size > 0 || (typeof quickModeActive !== 'undefined' && quickModeActive))) {
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
        if (activeFilters.size > 0) {
            applyActiveFiltersToRooms();
        }
    }

    function applySavedRoomStates() {
        const map = loadRoomStateMap();
        applyRoomStates(map);
    }
    
async function applyRoomStatesFromDb() {
        const snapshotDate = isDateRangeMode() ? selectedRangeEndDate : selectedSnapshotDate;
        const isToday = snapshotDate === getTodayLocal();
        const res = isToday
            ? await apiRequest('get_all_room_states', { building: BUILDING_ID })
            : await apiRequest('get_room_snapshots', { building: BUILDING_ID, snapshot_date: snapshotDate });
        if (!res || !Array.isArray(res.rooms)) return;
        const map = {};
        res.rooms.forEach(row => {
            const rawId = (row.room_id || '').toString();
            const idTrim = rawId.trim();
            if (!idTrim) return;
            map[idTrim] = row;
            map[idTrim.replace(/\s+/g, '')] = row;
            map[idTrim.replace(/\s*[-–]\s*/g, '-') ] = row;
            const digits = idTrim.replace(/\D/g, '');
            if (digits) map[digits] = row;
        });
        applyRoomStates(map);
    }
    window.applyRoomStatesFromDb = applyRoomStatesFromDb;

    // snapshot diffing removed per user request (no badges shown)

    document.addEventListener('date-selected', async (e) => {
        try {
            const startRaw = String(e?.detail?.start_date || e?.detail?.startDate || '').trim();
            const endRaw = String(e?.detail?.end_date || e?.detail?.endDate || e?.detail?.date || '').trim();
            if (!endRaw && !startRaw) return;
            const startISO = (startRaw || endRaw).slice(0, 10);
            const endISO = (endRaw || startRaw).slice(0, 10);
            setSelectedDateRange(startISO, endISO);
            // render immediately from cache first (no waiting)
            if (typeof renderServiceSidebar === 'function') renderServiceSidebar();
            if (!document.getElementById('dashboardModal')?.classList.contains('hidden') && typeof window.updateDashboardCharts === 'function') {
                window.updateDashboardCharts();
            }

            // then fetch/update in parallel
            await Promise.allSettled([
                applyRoomStatesFromDb(),
                loadRoomInfoMapFromDb(),
                loadMaintenanceTasksFromDb()
            ]);

            if (typeof renderServiceSidebar === 'function') renderServiceSidebar();
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

    // Fast first render from current cache while network requests are in-flight.
    renderServiceSidebar();
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

    // Fetch core data in parallel to reduce startup delay.
    Promise.allSettled([
        applyRoomStatesFromDb(),
        loadRoomInfoMapFromDb(),
        loadMaintenanceTasksFromDb()
    ]).finally(() => {
        document.documentElement.classList.remove('room-hydrating');
        applyApBadges();
        renderServiceSidebar();
        initAdminButtonShared();
        initAdminPasswordSettings();
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
        const isPhone = window.matchMedia('(max-width: 768px)').matches;
        const nav = document.querySelector('.page-navbar');
        const topOffset = (nav?.offsetHeight || 80) + 44;
        const getPhoneDrawerTop = () => {
            const navBottom = (nav?.getBoundingClientRect().bottom || (nav?.offsetHeight || 64)) + 8;
            const serviceBtn = document.getElementById('mobileServiceDrawerToggle');
            const roomTypeBtn = document.getElementById('mobileRoomTypeDrawerToggle');
            const serviceBottom = serviceBtn ? (serviceBtn.getBoundingClientRect().bottom + 8) : navBottom;
            const roomTypeBottom = roomTypeBtn ? (roomTypeBtn.getBoundingClientRect().bottom + 8) : navBottom;
            return Math.max(navBottom, serviceBottom, roomTypeBottom);
        };

        if (isDesktop) {
            document.body.classList.remove('mobile-service-drawer-open');
            document.body.classList.remove('mobile-roomtype-drawer-open');
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
                panel.style.setProperty('transform', 'none', 'important');
                panel.style.setProperty('opacity', '1', 'important');
                panel.style.setProperty('transition', 'none', 'important');
                panel.style.setProperty('box-shadow', 'none', 'important');
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

            if (rightPanel) {
                if (!isPhone) {
                    rightPanel.style.setProperty('position', 'static', 'important');
                    rightPanel.style.setProperty('top', 'auto', 'important');
                    rightPanel.style.setProperty('left', 'auto', 'important');
                    rightPanel.style.setProperty('right', 'auto', 'important');
                    rightPanel.style.setProperty('width', 'min(100%, 560px)', 'important');
                    rightPanel.style.setProperty('max-height', 'none', 'important');
                    rightPanel.style.setProperty('overflow-y', 'visible', 'important');
                    rightPanel.style.setProperty('margin', '0 auto 12px', 'important');
                    rightPanel.style.setProperty('transform', 'none', 'important');
                    rightPanel.style.setProperty('transition', 'none', 'important');
                    rightPanel.style.setProperty('box-shadow', 'none', 'important');
                } else {
                    const openType = document.body.classList.contains('mobile-roomtype-drawer-open');
                    const drawerTop = getPhoneDrawerTop();
                    rightPanel.style.setProperty('position', 'fixed', 'important');
                    rightPanel.style.setProperty('top', `${drawerTop}px`, 'important');
                    rightPanel.style.setProperty('right', '8px', 'important');
                    rightPanel.style.setProperty('left', 'auto', 'important');
                    rightPanel.style.setProperty('width', 'min(88vw, 360px)', 'important');
                    rightPanel.style.setProperty('max-height', `calc(100vh - ${drawerTop + 12}px)`, 'important');
                    rightPanel.style.setProperty('overflow-y', 'auto', 'important');
                    rightPanel.style.setProperty('margin', '0', 'important');
                    rightPanel.style.setProperty('z-index', '4600', 'important');
                    rightPanel.style.setProperty('box-shadow', '0 20px 40px rgba(15, 23, 42, 0.22)', 'important');
                    rightPanel.style.setProperty('transition', 'transform .22s ease, opacity .22s ease', 'important');
                    rightPanel.style.setProperty('transform', openType ? 'translateX(0)' : 'translateX(calc(100% + 16px))', 'important');
                    rightPanel.style.setProperty('opacity', openType ? '1' : '0.96', 'important');
                }
            }

            if (!leftPanel) return;
            if (!isPhone) {
                leftPanel.style.setProperty('position', 'static', 'important');
                leftPanel.style.setProperty('top', 'auto', 'important');
                leftPanel.style.setProperty('left', 'auto', 'important');
                leftPanel.style.setProperty('right', 'auto', 'important');
                leftPanel.style.setProperty('width', 'min(100%, 560px)', 'important');
                leftPanel.style.setProperty('max-height', 'none', 'important');
                leftPanel.style.setProperty('overflow-y', 'visible', 'important');
                leftPanel.style.setProperty('margin', '0 auto 12px', 'important');
                leftPanel.style.setProperty('transform', 'none', 'important');
                leftPanel.style.setProperty('transition', 'none', 'important');
                leftPanel.style.setProperty('box-shadow', 'none', 'important');
                return;
            }

            const open = document.body.classList.contains('mobile-service-drawer-open');
            const drawerTop = getPhoneDrawerTop();
            leftPanel.style.setProperty('position', 'fixed', 'important');
            leftPanel.style.setProperty('top', `${drawerTop}px`, 'important');
            leftPanel.style.setProperty('left', '8px', 'important');
            leftPanel.style.setProperty('right', 'auto', 'important');
            leftPanel.style.setProperty('width', 'min(88vw, 360px)', 'important');
            leftPanel.style.setProperty('max-height', `calc(100vh - ${drawerTop + 12}px)`, 'important');
            leftPanel.style.setProperty('overflow-y', 'auto', 'important');
            leftPanel.style.setProperty('margin', '0', 'important');
            leftPanel.style.setProperty('z-index', '4600', 'important');
            leftPanel.style.setProperty('box-shadow', '0 20px 40px rgba(15, 23, 42, 0.22)', 'important');
            leftPanel.style.setProperty('transition', 'transform .22s ease, opacity .22s ease', 'important');
            leftPanel.style.setProperty('transform', open ? 'translateX(0)' : 'translateX(calc(-100% - 16px))', 'important');
            leftPanel.style.setProperty('opacity', open ? '1' : '0.96', 'important');
        }
    }

    function initMobileServiceDrawerControls() {
        const leftPanel = document.querySelector('.legend-block.left-info-panel');
        const rightPanel = document.querySelector('.legend-block.main-legend');
        const nav = document.querySelector('.page-navbar');
        if ((!leftPanel && !rightPanel) || !nav) return;

        let toggleBtn = document.getElementById('mobileServiceDrawerToggle');
        if (!toggleBtn) {
            toggleBtn = document.createElement('button');
            toggleBtn.id = 'mobileServiceDrawerToggle';
            toggleBtn.type = 'button';
            toggleBtn.textContent = 'Service Status';
            document.body.appendChild(toggleBtn);
        }

        let backdrop = document.getElementById('mobileServiceDrawerBackdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = 'mobileServiceDrawerBackdrop';
            document.body.appendChild(backdrop);
        }

        let roomTypeBtn = document.getElementById('mobileRoomTypeDrawerToggle');
        if (!roomTypeBtn) {
            roomTypeBtn = document.createElement('button');
            roomTypeBtn.id = 'mobileRoomTypeDrawerToggle';
            roomTypeBtn.type = 'button';
            roomTypeBtn.textContent = 'Room Type';
            document.body.appendChild(roomTypeBtn);
        }

        const phoneQuery = window.matchMedia('(max-width: 768px)');
        const applyPhoneVisibility = () => {
            if (!phoneQuery.matches) {
                document.body.classList.remove('mobile-service-drawer-open');
                document.body.classList.remove('mobile-roomtype-drawer-open');
            }
            window.requestAnimationFrame(enforceSidePanelsLayout);
        };

        toggleBtn.addEventListener('click', () => {
            if (!phoneQuery.matches) return;
            const isOpen = document.body.classList.contains('mobile-service-drawer-open');
            document.body.classList.toggle('mobile-service-drawer-open', !isOpen);
            if (!isOpen) document.body.classList.remove('mobile-roomtype-drawer-open');
            window.requestAnimationFrame(enforceSidePanelsLayout);
        });

        roomTypeBtn.addEventListener('click', () => {
            if (!phoneQuery.matches) return;
            const isOpen = document.body.classList.contains('mobile-roomtype-drawer-open');
            document.body.classList.toggle('mobile-roomtype-drawer-open', !isOpen);
            if (!isOpen) document.body.classList.remove('mobile-service-drawer-open');
            window.requestAnimationFrame(enforceSidePanelsLayout);
        });

        backdrop.addEventListener('click', () => {
            document.body.classList.remove('mobile-service-drawer-open');
            document.body.classList.remove('mobile-roomtype-drawer-open');
            window.requestAnimationFrame(enforceSidePanelsLayout);
        });

        window.addEventListener('resize', applyPhoneVisibility);
        applyPhoneVisibility();
    }

let buildingAutoScale = 1;
let buildingUserScale = 1;
let pinchStartDistance = 0;
let pinchStartUserScale = 1;

function getBuildingScaleTarget() {
    if (BUILDING_ID === 'B') {
        return document.querySelector('.building-b-container') || document.querySelector('.building-plan');
    }
    return document.querySelector('.building') || document.querySelector('.building-plan');
}

function getTouchDistance(touches) {
        if (!touches || touches.length < 2) return 0;
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.hypot(dx, dy);
    }

function applyBuildingScale() {
        const building = getBuildingScaleTarget();
        const wrapper = document.querySelector('.plan-wrapper');
        if (!building || !wrapper) return;
        const finalScale = buildingAutoScale * buildingUserScale;
        const planHeight = building.scrollHeight || building.getBoundingClientRect().height;
        building.style.transformOrigin = 'top center';
        building.style.transform = `scale(${finalScale})`;
        wrapper.style.minHeight = `${Math.ceil(planHeight * finalScale) + 24}px`;
    }

    function initMobilePinchZoom() {
        const wrapper = document.querySelector('.plan-wrapper');
        if (!wrapper) return;
        const phoneQuery = window.matchMedia('(max-width: 768px)');

        wrapper.addEventListener('touchstart', (event) => {
            if (!phoneQuery.matches) return;
            if (event.touches.length < 2) return;
            pinchStartDistance = getTouchDistance(event.touches);
            pinchStartUserScale = buildingUserScale;
        }, { passive: true });

        wrapper.addEventListener('touchmove', (event) => {
            if (!phoneQuery.matches) return;
            if (event.touches.length < 2 || pinchStartDistance <= 0) return;
            const distance = getTouchDistance(event.touches);
            if (!distance) return;

            event.preventDefault();
            const ratio = distance / pinchStartDistance;
            buildingUserScale = Math.min(3, Math.max(0.7, pinchStartUserScale * ratio));
            applyBuildingScale();
        }, { passive: false });

        wrapper.addEventListener('touchend', () => {
            pinchStartDistance = 0;
        }, { passive: true });
    }

    function centerBuildingOnPhone() {
        const wrapper = document.querySelector('.plan-wrapper');
        if (!wrapper) return;
        if (!window.matchMedia('(max-width: 768px)').matches) return;
        const maxScrollLeft = Math.max(0, wrapper.scrollWidth - wrapper.clientWidth);
        wrapper.scrollLeft = Math.round(maxScrollLeft / 2);
    }

    // Fit the whole plan section to current viewport width.
    function scaleBuildingToFit() {
        const building = getBuildingScaleTarget();
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
        const isPhone = window.matchMedia('(max-width: 768px)').matches;
        buildingAutoScale = scale;
        if (!isPhone) {
            buildingUserScale = 1;
        }
        applyBuildingScale();
        if (isPhone) {
            window.requestAnimationFrame(centerBuildingOnPhone);
        }
    }

    hoistSidePanelsOutOfBuilding();
    initMobileServiceDrawerControls();
    initMobilePinchZoom();
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
        const inRange = dateStr >= selectedRangeStartDate && dateStr <= selectedRangeEndDate;
        btn.className = 'date-pill' + (inRange ? ' active' : '');
        btn.textContent = String(d.getDate());
        btn.title = dateStr;
        btn.addEventListener('click', async () => {
                setSelectedSingleDate(dateStr);
                renderDateStrip();
                if (typeof window.applyRoomStatesFromDb === 'function') {
                    await window.applyRoomStatesFromDb();
                }
               await loadRoomInfoMapFromDb();
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
        if (isDateRangeMode()) {
            const s = new Date(selectedRangeStartDate);
            const e = new Date(selectedRangeEndDate);
            const sTxt = isNaN(s.getTime()) ? selectedRangeStartDate : s.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
            const eTxt = isNaN(e.getTime()) ? selectedRangeEndDate : e.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
            sel.textContent = `${sTxt} - ${eTxt}`;
        } else {
            const d = new Date(selectedSnapshotDate);
            sel.textContent = isNaN(d.getTime())
                ? selectedSnapshotDate
                : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        }
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
        loginBtn.addEventListener("click", async () => {
            let adminPassword = getAdminPassword();
            if (passInput.value !== adminPassword) {
                await syncAdminPasswordFromDb();
                adminPassword = getAdminPassword();
            }
            if (passInput.value === adminPassword) {
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
function initAdminPasswordSettings() {
    const changeBtn = document.getElementById('changePasswordBtn') || document.getElementById('admin-change-password-btn');
    
    // 🔥 ถ้าไม่เจอปุ่มเปลี่ยนรหัส (เช่น อยู่หน้า index) ให้จบฟังก์ชันเงียบๆ ไม่ต้อง Error
    if (!changeBtn) return; 

    const currentInput = document.getElementById('currentPassword') || document.getElementById('admin-current-password');
    const newInput = document.getElementById('newPassword') || document.getElementById('admin-new-password');
    const confirmInput = document.getElementById('confirmPassword') || document.getElementById('admin-confirm-password');

    changeBtn.addEventListener('click', async () => {
        if (localStorage.getItem('isAdmin') !== 'true') {
            alert('Admin only.');
            return;
        }

        const currentPassword = currentInput.value;
        const newPassword = newInput.value.trim();
        const confirmPassword = confirmInput.value.trim();
        const savedPassword = localStorage.getItem('admin_password_v1') || '1234';

        if (currentPassword !== savedPassword) {
            alert('รหัสผ่านปัจจุบันไม่ถูกต้อง ❌');
            return;
        }
        if (newPassword.length < 4) {
            alert('รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร');
            return;
        }
        if (newPassword !== confirmPassword) {
            alert('รหัสผ่านใหม่ไม่ตรงกัน');
            return;
        }

        // ส่งข้อมูลไปบันทึกที่ฐานข้อมูล (api.php)
        const res = await apiRequest('set_admin_password', {
            password: newPassword
        });

        if (!res || res.ok !== true) {
            alert('เกิดข้อผิดพลาดในการบันทึกลงฐานข้อมูล (ลองเช็คว่าไฟล์ db.php สร้างตาราง app_settings แล้วหรือยัง)');
            return;
        }

        // บันทึกลงเครื่อง (localStorage) หลังจากเซฟลงฐานข้อมูลสำเร็จ
        localStorage.setItem('admin_password_v1', newPassword); 
        currentInput.value = '';
        newInput.value = '';
        confirmInput.value = '';
        alert('เปลี่ยนรหัสผ่านสำเร็จ! ระบบจำรหัสใหม่แล้ว ✅');
    });
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
        document.body.dataset.printMode = 'plan';
        document.body.classList.add('print-plan');
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

    const isBuildingB =
        document.body.getAttribute('data-building-id') === 'B' ||
        plan.classList.contains('building-b-wrapper');

    const fitMultiplier = isBuildingB ? 0.90 : 0.92;
    const scale = Math.min(scaleX, scaleY) * fitMultiplier;

    const scaledW = planHeight * scale;
    const scaledH = planWidth * scale;

    const extraShiftX = 0;
    const extraShiftY = isBuildingB ? -370 : -170;

    const translateX = (printableW - scaledW) / 2 + extraShiftX;
    const translateY = (printableH - scaledH) / 2 + scaledH + extraShiftY;

    document.body.style.setProperty('--print-page-w', `${pageW.toFixed(2)}px`);
    document.body.style.setProperty('--print-page-h', `${pageH.toFixed(2)}px`);
    document.body.style.setProperty('--print-rotate-scale', scale.toFixed(4));
    document.body.style.setProperty('--print-rotate-tx', `${translateX.toFixed(2)}px`);
    document.body.style.setProperty('--print-rotate-ty', `${translateY.toFixed(2)}px`);
}


// ✅ ทำให้ async
async function prepareReportPrint() {
    document.body.classList.add('print-report');
    modal.classList.remove('hidden');

    scalePlanForPrintPortrait();

    if (typeof updateDashboardCharts === 'function') {
        await updateDashboardCharts();
    }

    // รอให้ chart render เสร็จ
    await new Promise(resolve => setTimeout(resolve, 600));

    if (typeof maintenanceChart !== 'undefined' && maintenanceChart) {
        maintenanceChart.resize();
    }

    window.dispatchEvent(new Event('resize'));
}


window.addEventListener('beforeprint', () => {
    const mode = document.body.dataset.printMode || 'plan';
    scalePlanForPrintPortrait();
    if (mode === 'report') {
        const dashboardModal = document.getElementById('dashboardModal');
        if (dashboardModal) dashboardModal.classList.remove('hidden');
        document.body.classList.add('print-report');
        document.body.classList.remove('print-plan');
    } else {
        document.body.classList.add('print-plan');
        document.body.classList.remove('print-report');
    }
});



window.addEventListener('afterprint', () => {
    document.body.style.setProperty('--print-page-w', '');
    document.body.style.setProperty('--print-page-h', '');
    document.body.style.setProperty('--print-rotate-scale', '1');
    document.body.style.setProperty('--print-rotate-tx', '0px');
    document.body.style.setProperty('--print-rotate-ty', '0px');
    document.body.classList.remove('print-report');
    document.body.classList.remove('print-plan');
    document.body.dataset.printMode = '';
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
    document.body.classList.add('quick-update-mode-active');
    
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
    document.body.classList.remove('quick-update-mode-active');
    document.querySelectorAll('.quick-badge-icon').forEach(el => el.remove());
    if (activeFilters.size === 0) {
        document.querySelectorAll('.room .maint-icon').forEach(el => el.remove());
    }
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
    const resolvedRoomIds = activeFilters.size > 0 ? getLatestResolvedRoomIds(activeFilters) : new Set();
    rooms.forEach(room => {
        const roomMaint = (room.getAttribute('data-maint') || '').trim();
        const roomId = String(getRoomId(room) || '').trim();
        const isResolvedMatch = roomId ? isResolvedRoomMatch(resolvedRoomIds, roomId) : false;
        
        if (activeFilters.size === 0) {
            // ถ้าไม่ได้เลือกฟิลเตอร์อะไรเลย ให้แสดงผลปกติทุกห้อง
            room.classList.remove('is-dimmed-force', 'is-highlight-force');
        } else if (activeFilters.has(roomMaint) || isResolvedMatch) {
            // ถ้าห้องตรงกับสถานะที่เลือก ให้คงสภาพปกติ (ไม่เด้ง)
            room.classList.remove('is-dimmed-force');
            room.classList.remove('is-highlight-force');
        } else {
            // ถ้าห้องไม่ตรง ให้จางลง
            room.classList.remove('is-highlight-force');
            room.classList.add('is-dimmed-force');
        }
    });

    function printBuildingReport() {
    const dashboardModal = document.getElementById('dashboardModal');
    if (dashboardModal) {
        dashboardModal.classList.remove('hidden');
    }

    setTimeout(() => {
        window.print();
    }, 300);
}
}
