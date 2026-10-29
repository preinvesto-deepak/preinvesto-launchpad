<?php
// Shared helpers for the customer share-link endpoints (interior_share.php,
// interior_share_view.php). Not an endpoint itself — always require_once'd.
//
// A share is a customer-safe SNAPSHOT of one project published by its owner
// under an unguessable code. The public endpoint serves only that snapshot,
// never the owner's workspace.

require_once __DIR__ . '/auth_common.php';

const SHARE_MAX_PIN_FAILS = 5;
const SHARE_LOCK_MINUTES  = 15;

/** Create the table on first use so a missed migration can't break sharing. */
function ensure_share_table(): void {
    static $done = false;
    if ($done) return;
    $ok = db()->query(
        'CREATE TABLE IF NOT EXISTS interior_shares (
           code          CHAR(32)     NOT NULL,
           user_id       VARCHAR(36)  NOT NULL,
           project_id    VARCHAR(64)  NOT NULL,
           pin_hash      VARCHAR(255) NULL,
           enabled       TINYINT(1)   NOT NULL DEFAULT 1,
           snapshot_json LONGTEXT     NOT NULL,
           fail_count    INT          NOT NULL DEFAULT 0,
           locked_until  DATETIME     NULL,
           created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
           updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
           PRIMARY KEY (code),
           UNIQUE KEY uq_share_project (user_id, project_id),
           CONSTRAINT fk_share_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    if (!$ok) json_fail(500, 'Could not prepare sharing.');
    $done = true;
}

function share_meta(?array $row): ?array {
    if (!$row) return null;
    return [
        'code'      => $row['code'],
        'enabled'   => (bool)$row['enabled'],
        'hasPin'    => !empty($row['pin_hash']),
        'updatedAt' => $row['updated_at'],
    ];
}

function load_share(string $userId, string $projectId): ?array {
    $stmt = db()->prepare(
        'SELECT code, enabled, pin_hash, updated_at FROM interior_shares WHERE user_id = ? AND project_id = ? LIMIT 1'
    );
    $stmt->bind_param('ss', $userId, $projectId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}
