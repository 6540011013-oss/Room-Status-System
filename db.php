<?php
declare(strict_types=1);

function get_pdo(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dbHost = 'localhost';
    $dbName = 'hotel_system';
    $dbUser = 'root';
    $dbPass = '';
    $charset = 'utf8mb4';

    $dsn = "mysql:host={$dbHost};dbname={$dbName};charset={$charset}";
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];

    $pdo = new PDO($dsn, $dbUser, $dbPass, $options);
    return $pdo;
}

function ensure_tables(PDO $pdo): void
{
    // Prevent silent truncation/failures when saving item snapshots with base64 images.
    // Some local MySQL setups default to 1MB max_allowed_packet, which is too small.
    try {
        $row = $pdo->query("SHOW GLOBAL VARIABLES LIKE 'max_allowed_packet'")->fetch();
        $currentPacket = isset($row['Value']) ? (int)$row['Value'] : 0;
        $targetPacket = 64 * 1024 * 1024; // 64MB
        if ($currentPacket > 0 && $currentPacket < $targetPacket) {
            $pdo->exec("SET GLOBAL max_allowed_packet = {$targetPacket}");
        }
    } catch (Throwable $e) {
        // ignore if privilege is not sufficient; app still runs with current setting
    }

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS room_types (
            id VARCHAR(64) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            color VARCHAR(32) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS maintenance_categories (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            icon VARCHAR(16) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS item_categories (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            label VARCHAR(255) NOT NULL,
            icon VARCHAR(16) NOT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_item_category_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS rooms_status (
            building VARCHAR(8) NOT NULL,
            room_id VARCHAR(32) NOT NULL,
            guest_name VARCHAR(255) DEFAULT '',
            type_id VARCHAR(64) DEFAULT '',
            room_note TEXT,
            maint_status VARCHAR(255) DEFAULT '',
            maint_note TEXT,
            ap_installed TINYINT(1) DEFAULT 0,
            ap_date DATE NULL,
            bed_badge VARCHAR(16) DEFAULT '',
            room_image MEDIUMBLOB NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS room_status_history (
            building VARCHAR(8) NOT NULL,
            room_id VARCHAR(32) NOT NULL,
            snapshot_date DATE NOT NULL,
            guest_name VARCHAR(255) DEFAULT '',
            type_id VARCHAR(64) DEFAULT '',
            room_note TEXT,
            maint_status VARCHAR(255) DEFAULT '',
            maint_note TEXT,
            ap_installed TINYINT(1) DEFAULT 0,
            ap_date DATE NULL,
            bed_badge VARCHAR(16) DEFAULT '',
            room_image MEDIUMBLOB NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (building, room_id, snapshot_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS room_items_history (
            building VARCHAR(8) NOT NULL,
            room_id VARCHAR(32) NOT NULL,
            snapshot_date DATE NOT NULL,
            items_json LONGTEXT NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (building, room_id, snapshot_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS maintenance_tasks (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            building VARCHAR(8) NOT NULL,
            room_id VARCHAR(32) NOT NULL,
            type VARCHAR(255) NOT NULL,
            note TEXT,
            reported_date DATE NOT NULL,
            resolved_date DATE NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_maint_building_status (building, status),
            KEY idx_maint_building_room (building, room_id),
            KEY idx_maint_reported (reported_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");

    // Ensure unique key for upserts (safe even if it already exists)
    try {
        $pdo->exec("ALTER TABLE rooms_status ADD UNIQUE KEY uniq_building_room (building, room_id);");
    } catch (Throwable $e) {
        // ignore if already exists or table doesn't allow
    }

    // Backward-compatible migrations
    try {
        $pdo->exec("ALTER TABLE rooms_status ADD COLUMN room_note TEXT AFTER type_id;");
    } catch (Throwable $e) {
        // ignore when already exists
    }
    try {
        $pdo->exec("ALTER TABLE room_status_history ADD COLUMN room_note TEXT AFTER type_id;");
    } catch (Throwable $e) {
        // ignore when already exists
    }
    try {
        $pdo->exec("ALTER TABLE rooms_status ADD COLUMN room_image MEDIUMBLOB NULL AFTER bed_badge;");
    } catch (Throwable $e) {
        // ignore when already exists
    }
    try {
        $pdo->exec("ALTER TABLE room_status_history ADD COLUMN room_image MEDIUMBLOB NULL AFTER bed_badge;");
    } catch (Throwable $e) {
        // ignore when already exists
    }

    // Prune history older than 30 days
    try {
        $pdo->exec("DELETE FROM room_status_history WHERE snapshot_date < DATE_SUB(CURDATE(), INTERVAL 30 DAY);");
        $pdo->exec("DELETE FROM room_items_history WHERE snapshot_date < DATE_SUB(CURDATE(), INTERVAL 30 DAY);");
        $pdo->exec("DELETE FROM maintenance_tasks WHERE reported_date < DATE_SUB(CURDATE(), INTERVAL 90 DAY);");
    } catch (Throwable $e) {
        // ignore pruning errors
    }

}
