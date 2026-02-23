<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/db.php';

function json_ok(array $data = []): void
{
    echo json_encode(['ok' => true] + $data);
    exit;
}

function json_err(string $message, int $code = 400): void
{
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $message]);
    exit;
}

try {
    $pdo = get_pdo();
    ensure_tables($pdo);
} catch (Throwable $e) {
    json_err('DB connection failed', 500);
}

$raw = file_get_contents('php://input');
$input = json_decode($raw ?: '[]', true);
if (!is_array($input)) {
    $input = [];
}

$action = $_REQUEST['action'] ?? $input['action'] ?? '';
if (!$action) {
    json_err('Missing action');
}

switch ($action) {
    case 'get_room_types': {
        $stmt = $pdo->query('SELECT id, name, color FROM room_types ORDER BY name');
        json_ok(['room_types' => $stmt->fetchAll()]);
    }
    case 'add_room_type': {
        $id = trim((string)($input['id'] ?? $_REQUEST['id'] ?? ''));
        $name = trim((string)($input['name'] ?? $_REQUEST['name'] ?? ''));
        $color = trim((string)($input['color'] ?? $_REQUEST['color'] ?? ''));
        if ($id === '' || $name === '' || $color === '') {
            json_err('Missing room type fields');
        }
        $stmt = $pdo->prepare('INSERT INTO room_types (id, name, color) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), color = VALUES(color)');
        $stmt->execute([$id, $name, $color]);
        json_ok(['id' => $id]);
    }
    case 'delete_room_type': {
        $id = trim((string)($input['id'] ?? $_REQUEST['id'] ?? ''));
        if ($id === '') {
            json_err('Missing id');
        }
        $stmt = $pdo->prepare('DELETE FROM room_types WHERE id = ?');
        $stmt->execute([$id]);
        json_ok();
    }
    case 'get_maintenance_categories': {
        $stmt = $pdo->query('SELECT id, name, icon FROM maintenance_categories ORDER BY id');
        json_ok(['maintenance_categories' => $stmt->fetchAll()]);
    }
    case 'get_item_categories': {
        $stmt = $pdo->query('SELECT id, name, label, icon, sort_order FROM item_categories ORDER BY sort_order ASC, id ASC');
        $rows = $stmt->fetchAll();
        if (!$rows) {
            $seed = [
                ['เฟอร์นิเจอร์', 'Furniture', '🛋️', 10],
                ['เครื่องใช้ไฟฟ้า', 'Appliances', '💡', 20],
                ['ของตกแต่ง', 'Decor', '🖼️', 30],
                ['อื่นๆ', 'Other', '📦', 40],
            ];
            $ins = $pdo->prepare('INSERT INTO item_categories (name, label, icon, sort_order) VALUES (?, ?, ?, ?)');
            foreach ($seed as $cat) {
                try {
                    $ins->execute($cat);
                } catch (Throwable $e) {
                    // ignore duplicates
                }
            }
            $stmt = $pdo->query('SELECT id, name, label, icon, sort_order FROM item_categories ORDER BY sort_order ASC, id ASC');
            $rows = $stmt->fetchAll();
        }
        json_ok(['item_categories' => $rows]);
    }
    case 'add_item_category': {
        $name = trim((string)($input['name'] ?? $_REQUEST['name'] ?? ''));
        $label = trim((string)($input['label'] ?? $_REQUEST['label'] ?? ''));
        $icon = trim((string)($input['icon'] ?? $_REQUEST['icon'] ?? ''));
        if ($name === '' || $label === '' || $icon === '') {
            json_err('Missing item category fields');
        }
        $sortOrder = (int)($input['sort_order'] ?? $_REQUEST['sort_order'] ?? 0);
        $stmt = $pdo->prepare('
            INSERT INTO item_categories (name, label, icon, sort_order)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                label = VALUES(label),
                icon = VALUES(icon),
                sort_order = VALUES(sort_order)
        ');
        $stmt->execute([$name, $label, $icon, $sortOrder]);
        json_ok();
    }
    case 'delete_item_category': {
        $name = trim((string)($input['name'] ?? $_REQUEST['name'] ?? ''));
        if ($name === '') {
            json_err('Missing item category name');
        }
        $stmt = $pdo->prepare('DELETE FROM item_categories WHERE name = ?');
        $stmt->execute([$name]);
        json_ok();
    }
    case 'add_maintenance_category': {
        $name = trim((string)($input['name'] ?? $_REQUEST['name'] ?? ''));
        $icon = trim((string)($input['icon'] ?? $_REQUEST['icon'] ?? ''));
        if ($name === '' || $icon === '') {
            json_err('Missing maintenance category fields');
        }
        $stmt = $pdo->prepare('INSERT INTO maintenance_categories (name, icon) VALUES (?, ?)');
        $stmt->execute([$name, $icon]);
        json_ok(['id' => (int)$pdo->lastInsertId()]);
    }
    case 'delete_maintenance_category': {
        $id = (int)($input['id'] ?? $_REQUEST['id'] ?? 0);
        $name = trim((string)($input['name'] ?? $_REQUEST['name'] ?? ''));
        if ($id > 0) {
            $stmt = $pdo->prepare('DELETE FROM maintenance_categories WHERE id = ?');
            $stmt->execute([$id]);
            json_ok();
        }
        if ($name === '') {
            json_err('Missing id or name');
        }
        $stmt = $pdo->prepare('DELETE FROM maintenance_categories WHERE name = ?');
        $stmt->execute([$name]);
        json_ok();
    }
    case 'get_room_state': {
        $building = trim((string)($input['building'] ?? $_REQUEST['building'] ?? ''));
        $roomId = trim((string)($input['room_id'] ?? $_REQUEST['room_id'] ?? ''));
        if ($building === '' || $roomId === '') {
            json_err('Missing building or room_id');
        }
        $stmt = $pdo->prepare('SELECT building, room_id, guest_name, type_id AS room_type, room_note, maint_status, maint_note, ap_installed, ap_date AS ap_install_date, bed_badge FROM rooms_status WHERE building = ? AND room_id = ?');
        $stmt->execute([$building, $roomId]);
        $row = $stmt->fetch();
        json_ok(['room' => $row ?: null]);
    }
    case 'get_all_room_states': {
        $building = trim((string)($input['building'] ?? $_REQUEST['building'] ?? ''));
        if ($building === '') {
            json_err('Missing building');
        }
        $stmt = $pdo->prepare('SELECT building, room_id, guest_name, type_id AS room_type, room_note, maint_status, maint_note, ap_installed, ap_date AS ap_install_date, bed_badge FROM rooms_status WHERE building = ?');
        $stmt->execute([$building]);
        json_ok(['rooms' => $stmt->fetchAll()]);
    }
    case 'get_room_snapshots': {
        $building = trim((string)($input['building'] ?? $_REQUEST['building'] ?? ''));
        $date = trim((string)($input['snapshot_date'] ?? $_REQUEST['snapshot_date'] ?? ''));
        if ($building === '' || $date === '') {
            json_err('Missing building or snapshot_date');
        }
        $stmt = $pdo->prepare('
            SELECT building, room_id, guest_name, type_id AS room_type, room_note, maint_status, maint_note, ap_installed, ap_date AS ap_install_date, bed_badge
            FROM room_status_history
            WHERE building = ? AND snapshot_date = ?
        ');
        $stmt->execute([$building, $date]);
        json_ok(['rooms' => $stmt->fetchAll()]);
    }
    case 'save_room_snapshot': {
        $building = trim((string)($input['building'] ?? $_REQUEST['building'] ?? ''));
        $roomId = trim((string)($input['room_id'] ?? $_REQUEST['room_id'] ?? ''));
        $date = trim((string)($input['snapshot_date'] ?? $_REQUEST['snapshot_date'] ?? ''));
        if ($building === '' || $roomId === '' || $date === '') {
            json_err('Missing building, room_id or snapshot_date');
        }
        $guestName = trim((string)($input['guest_name'] ?? $_REQUEST['guest_name'] ?? ''));
        $roomType = trim((string)($input['room_type'] ?? $_REQUEST['room_type'] ?? ''));
        $roomNote = trim((string)($input['room_note'] ?? $_REQUEST['room_note'] ?? ''));
        $maintStatus = trim((string)($input['maint_status'] ?? $_REQUEST['maint_status'] ?? ''));
        $maintNote = trim((string)($input['maint_note'] ?? $_REQUEST['maint_note'] ?? ''));
        $apInstalled = (int)($input['ap_installed'] ?? $_REQUEST['ap_installed'] ?? 0);
        $apDate = trim((string)($input['ap_install_date'] ?? $_REQUEST['ap_install_date'] ?? ''));
        $bedBadge = trim((string)($input['bed_badge'] ?? $_REQUEST['bed_badge'] ?? ''));
        $apDateValue = $apDate === '' ? null : $apDate;

        $stmt = $pdo->prepare("
            INSERT INTO room_status_history
                (building, room_id, snapshot_date, guest_name, type_id, room_note, maint_status, maint_note, ap_installed, ap_date, bed_badge)
            VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                guest_name = VALUES(guest_name),
                type_id = VALUES(type_id),
                room_note = VALUES(room_note),
                maint_status = VALUES(maint_status),
                maint_note = VALUES(maint_note),
                ap_installed = VALUES(ap_installed),
                ap_date = VALUES(ap_date),
                bed_badge = VALUES(bed_badge)
        ");
        $stmt->execute([$building, $roomId, $date, $guestName, $roomType, $roomNote, $maintStatus, $maintNote, $apInstalled, $apDateValue, $bedBadge]);
        json_ok();
    }
    case 'get_room_items_snapshot': {
        $building = trim((string)($input['building'] ?? $_REQUEST['building'] ?? ''));
        $date = trim((string)($input['snapshot_date'] ?? $_REQUEST['snapshot_date'] ?? ''));
        if ($building === '' || $date === '') {
            json_err('Missing building or snapshot_date');
        }
        $stmt = $pdo->prepare('
            SELECT room_id, items_json
            FROM room_items_history
            WHERE building = ? AND snapshot_date = ?
        ');
        $stmt->execute([$building, $date]);
        json_ok(['items' => $stmt->fetchAll()]);
    }
    case 'save_room_items_snapshot': {
        $building = trim((string)($input['building'] ?? $_REQUEST['building'] ?? ''));
        $roomId = trim((string)($input['room_id'] ?? $_REQUEST['room_id'] ?? ''));
        $date = trim((string)($input['snapshot_date'] ?? $_REQUEST['snapshot_date'] ?? ''));
        $itemsJson = (string)($input['items_json'] ?? $_REQUEST['items_json'] ?? '[]');
        if ($building === '' || $roomId === '' || $date === '') {
            json_err('Missing building, room_id or snapshot_date');
        }
        $stmt = $pdo->prepare("
            INSERT INTO room_items_history (building, room_id, snapshot_date, items_json)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE items_json = VALUES(items_json)
        ");
        $stmt->execute([$building, $roomId, $date, $itemsJson]);
        json_ok();
    }
    case 'save_room_state': {
        $building = trim((string)($input['building'] ?? $_REQUEST['building'] ?? ''));
        $roomId = trim((string)($input['room_id'] ?? $_REQUEST['room_id'] ?? ''));
        if ($building === '' || $roomId === '') {
            json_err('Missing building or room_id');
        }
        $guestName = trim((string)($input['guest_name'] ?? $_REQUEST['guest_name'] ?? ''));
        $roomType = trim((string)($input['room_type'] ?? $_REQUEST['room_type'] ?? ''));
        $roomNote = trim((string)($input['room_note'] ?? $_REQUEST['room_note'] ?? ''));
        $maintStatus = trim((string)($input['maint_status'] ?? $_REQUEST['maint_status'] ?? ''));
        $maintNote = trim((string)($input['maint_note'] ?? $_REQUEST['maint_note'] ?? ''));
        $apInstalled = (int)($input['ap_installed'] ?? $_REQUEST['ap_installed'] ?? 0);
        $apDate = trim((string)($input['ap_install_date'] ?? $_REQUEST['ap_install_date'] ?? ''));
        $bedBadge = trim((string)($input['bed_badge'] ?? $_REQUEST['bed_badge'] ?? ''));

        $apDateValue = $apDate === '' ? null : $apDate;

        $stmt = $pdo->prepare("
            INSERT INTO rooms_status
                (building, room_id, guest_name, type_id, room_note, maint_status, maint_note, ap_installed, ap_date, bed_badge)
            VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                guest_name = VALUES(guest_name),
                type_id = VALUES(type_id),
                room_note = VALUES(room_note),
                maint_status = VALUES(maint_status),
                maint_note = VALUES(maint_note),
                ap_installed = VALUES(ap_installed),
                ap_date = VALUES(ap_date),
                bed_badge = VALUES(bed_badge)
        ");
        $stmt->execute([$building, $roomId, $guestName, $roomType, $roomNote, $maintStatus, $maintNote, $apInstalled, $apDateValue, $bedBadge]);
        json_ok();
    }
    default:
        json_err('Unknown action', 400);
}