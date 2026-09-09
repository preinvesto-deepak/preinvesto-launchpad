<?php
// POST /api/auth_login.php — exchange email + password for a session token.
// Body: { email, password }  ->  { success, token, user }

require_once __DIR__ . '/auth_common.php';

auth_headers('POST, OPTIONS');
require_method(['POST']);

$data     = json_body();
$email    = strtolower(trim($data['email'] ?? ''));
$password = (string) ($data['password'] ?? '');

if ($email === '' || $password === '') {
    json_fail(400, 'Email and password are required.');
}

purge_expired();

$stmt = db()->prepare('SELECT id, name, email, mobile, password_hash FROM users WHERE email = ? LIMIT 1');
$stmt->bind_param('s', $email);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();
$stmt->close();

// Same message whether the email is unknown or the password is wrong, so this
// endpoint can't be used to discover which addresses have accounts.
if (!$user || !password_verify($password, $user['password_hash'])) {
    json_fail(401, 'Incorrect email or password.');
}

$stmt = db()->prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?');
$stmt->bind_param('s', $user['id']);
$stmt->execute();
$stmt->close();

json_ok([
    'token' => issue_session($user['id']),
    'user'  => ['id' => $user['id'], 'name' => $user['name'], 'email' => $user['email'], 'mobile' => $user['mobile']],
]);
