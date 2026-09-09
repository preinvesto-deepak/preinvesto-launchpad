<?php
// POST /api/auth_reset_password.php — redeem a reset link and set a new password.
// Body: { token, password }  ->  { success }

require_once __DIR__ . '/auth_common.php';

auth_headers('POST, OPTIONS');
require_method(['POST']);

$data     = json_body();
$token    = trim($data['token'] ?? '');
$password = (string) ($data['password'] ?? '');

if ($token === '') {
    json_fail(400, 'This reset link is invalid.');
}
if (strlen($password) < 8) {
    json_fail(400, 'Password must be at least 8 characters.');
}

$hash = hash('sha256', $token);
$stmt = db()->prepare(
    'SELECT user_id FROM password_resets
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
      LIMIT 1'
);
$stmt->bind_param('s', $hash);
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$row) {
    json_fail(400, 'This reset link has expired or already been used. Please request a new one.');
}

$userId  = $row['user_id'];
$newHash = password_hash($password, PASSWORD_DEFAULT);

$stmt = db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
$stmt->bind_param('ss', $newHash, $userId);
$stmt->execute();
$stmt->close();

// Burn the token.
$stmt = db()->prepare('UPDATE password_resets SET used_at = NOW() WHERE token_hash = ?');
$stmt->bind_param('s', $hash);
$stmt->execute();
$stmt->close();

// Changing a password signs out every existing session — if someone else had
// the old password, their token dies here too.
$stmt = db()->prepare('DELETE FROM user_sessions WHERE user_id = ?');
$stmt->bind_param('s', $userId);
$stmt->execute();
$stmt->close();

json_ok(['message' => 'Password updated. You can now sign in.']);
