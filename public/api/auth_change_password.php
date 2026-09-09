<?php
// POST /api/auth_change_password.php — change password while signed in.
// Header: Authorization: Bearer <token>
// Body: { currentPassword, newPassword }  ->  { success, message }

require_once __DIR__ . '/auth_common.php';

auth_headers('POST, OPTIONS');
require_method(['POST']);

$user = require_user();

$data    = json_body();
$current = (string) ($data['currentPassword'] ?? '');
$new     = (string) ($data['newPassword'] ?? '');

if ($current === '') {
    json_fail(400, 'Please enter your current password.');
}
if (strlen($new) < 8) {
    json_fail(400, 'New password must be at least 8 characters.');
}

$stmt = db()->prepare('SELECT password_hash FROM users WHERE id = ? LIMIT 1');
$stmt->bind_param('s', $user['id']);
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
$stmt->close();

// Proving knowledge of the current password is what stops someone with a
// borrowed session from locking the real owner out.
if (!$row || !password_verify($current, $row['password_hash'])) {
    json_fail(401, 'Your current password is incorrect.');
}

$hash = password_hash($new, PASSWORD_DEFAULT);
$stmt = db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
$stmt->bind_param('ss', $hash, $user['id']);
$stmt->execute();
$stmt->close();

// Sign out every OTHER device, but keep this one alive so the user isn't
// kicked out of the page they just used.
$keep = hash('sha256', bearer_token());
$stmt = db()->prepare('DELETE FROM user_sessions WHERE user_id = ? AND token_hash != ?');
$stmt->bind_param('ss', $user['id'], $keep);
$stmt->execute();
$stmt->close();

json_ok(['message' => 'Password updated. Other devices have been signed out.']);
