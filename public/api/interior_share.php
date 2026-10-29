<?php
// Owner-side management of a project's customer share link.
//   GET  /api/interior_share.php?projectId=...   -> { share: {...}|null }
//   POST /api/interior_share.php                 -> { action, projectId, ... }
//        action: publish (snapshot, optional pin) | setpin (pin, '' removes)
//                toggle (enabled) | regenerate | delete
// Header: Authorization: Bearer <token>

require_once __DIR__ . '/share_common.php';

auth_headers('GET, POST, OPTIONS');
require_method(['GET', 'POST']);

$user   = require_user();
$userId = $user['id'];
ensure_share_table();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $projectId = (string)($_GET['projectId'] ?? '');
    if ($projectId === '') json_fail(400, 'projectId is required');
    json_ok(['share' => share_meta(load_share($userId, $projectId))]);
}

// ---- POST ----
$body      = json_body();
$action    = $body['action'] ?? '';
$projectId = (string)($body['projectId'] ?? '');
if ($projectId === '') json_fail(400, 'projectId is required');

$hasPin = array_key_exists('pin', $body) && $body['pin'] !== null;
$pin    = $hasPin ? (string)$body['pin'] : null;
if ($hasPin && $pin !== '' && !preg_match('/^\d{4,8}$/', $pin)) {
    json_fail(400, 'PIN must be 4 to 8 digits.');
}
$pinHash = fn(string $p) => $p === '' ? null : password_hash($p, PASSWORD_BCRYPT);

$existing = load_share($userId, $projectId);

if ($action === 'publish') {
    $snapshot = $body['snapshot'] ?? null;
    if (!is_array($snapshot) || array_is_list($snapshot)) json_fail(400, 'Nothing to publish.');
    $json = json_encode($snapshot);

    if ($existing) {
        if ($hasPin) {
            $hash = $pinHash($pin);
            $stmt = db()->prepare('UPDATE interior_shares SET snapshot_json = ?, pin_hash = ?, fail_count = 0, locked_until = NULL WHERE code = ?');
            $stmt->bind_param('sss', $json, $hash, $existing['code']);
        } else {
            $stmt = db()->prepare('UPDATE interior_shares SET snapshot_json = ? WHERE code = ?');
            $stmt->bind_param('ss', $json, $existing['code']);
        }
    } else {
        $code = bin2hex(random_bytes(16));
        $hash = ($hasPin && $pin !== '') ? $pinHash($pin) : null;
        $stmt = db()->prepare('INSERT INTO interior_shares (code, user_id, project_id, pin_hash, snapshot_json) VALUES (?, ?, ?, ?, ?)');
        $stmt->bind_param('sssss', $code, $userId, $projectId, $hash, $json);
    }
    if (!$stmt->execute()) json_fail(500, 'Could not publish the share link.');
    $stmt->close();
    json_ok(['share' => share_meta(load_share($userId, $projectId))]);
}

if (!$existing) json_fail(404, 'This project has no share link yet.');

if ($action === 'setpin') {
    $hash = $pinHash($pin ?? '');
    $stmt = db()->prepare('UPDATE interior_shares SET pin_hash = ?, fail_count = 0, locked_until = NULL WHERE code = ?');
    $stmt->bind_param('ss', $hash, $existing['code']);
} elseif ($action === 'toggle') {
    $on   = !empty($body['enabled']) ? 1 : 0;
    $stmt = db()->prepare('UPDATE interior_shares SET enabled = ? WHERE code = ?');
    $stmt->bind_param('is', $on, $existing['code']);
} elseif ($action === 'regenerate') {
    $new  = bin2hex(random_bytes(16));
    $stmt = db()->prepare('UPDATE interior_shares SET code = ? WHERE code = ?');
    $stmt->bind_param('ss', $new, $existing['code']);
} elseif ($action === 'delete') {
    $stmt = db()->prepare('DELETE FROM interior_shares WHERE code = ?');
    $stmt->bind_param('s', $existing['code']);
    $stmt->execute();
    $stmt->close();
    json_ok(['share' => null]);
} else {
    json_fail(400, 'Unknown action.');
}

if (!$stmt->execute()) json_fail(500, 'Could not update the share link.');
$stmt->close();
json_ok(['share' => share_meta(load_share($userId, $projectId))]);
