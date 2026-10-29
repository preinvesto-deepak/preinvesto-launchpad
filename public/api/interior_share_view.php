<?php
// Public (no login) — the customer's view of a shared project.
//   POST /api/interior_share_view.php   { code, pin? }
// POST (not GET) so a PIN never lands in a URL, server log or history.
//   -> { pinRequired: true }           link is PIN-protected, none/empty given
//   -> { data: <snapshot> }            ok
//   -> 404 / 401 / 429                 unavailable / wrong PIN / locked out

require_once __DIR__ . '/share_common.php';

auth_headers('POST, OPTIONS');
require_method(['POST']);
header('Cache-Control: no-store');
ensure_share_table();

$body = json_body();
$code = $body['code'] ?? '';
$pin  = $body['pin'] ?? '';

if (!is_string($code) || !preg_match('/^[a-f0-9]{32}$/', $code)) {
    json_fail(404, 'This link is not available.');
}

$stmt = db()->prepare(
    'SELECT enabled, pin_hash, snapshot_json, fail_count, (locked_until > NOW()) AS locked
       FROM interior_shares WHERE code = ? LIMIT 1'
);
$stmt->bind_param('s', $code);
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$row || !$row['enabled']) json_fail(404, 'This link is not available.');

if (!empty($row['pin_hash'])) {
    $lockMsg = 'Too many wrong PINs. Please try again in ' . SHARE_LOCK_MINUTES . ' minutes.';
    if ($row['locked']) json_fail(429, $lockMsg);
    if ($pin === '' || $pin === null) json_ok(['pinRequired' => true]);

    if (!password_verify((string)$pin, $row['pin_hash'])) {
        $fails = (int)$row['fail_count'] + 1;
        if ($fails >= SHARE_MAX_PIN_FAILS) {
            $mins = SHARE_LOCK_MINUTES;
            $u = db()->prepare('UPDATE interior_shares SET fail_count = 0, locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE code = ?');
            $u->bind_param('is', $mins, $code);
            $u->execute();
            $u->close();
            json_fail(429, $lockMsg);
        }
        $u = db()->prepare('UPDATE interior_shares SET fail_count = ? WHERE code = ?');
        $u->bind_param('is', $fails, $code);
        $u->execute();
        $u->close();
        json_fail(401, 'Incorrect PIN. ' . (SHARE_MAX_PIN_FAILS - $fails) . ' attempt(s) left.');
    }
    if ((int)$row['fail_count'] > 0) {
        $u = db()->prepare('UPDATE interior_shares SET fail_count = 0 WHERE code = ?');
        $u->bind_param('s', $code);
        $u->execute();
        $u->close();
    }
}

json_ok(['data' => json_decode($row['snapshot_json'])]);
