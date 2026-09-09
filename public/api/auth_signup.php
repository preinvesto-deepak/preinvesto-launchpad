<?php
// POST /api/auth_signup.php — create an account and log straight in.
// Body: { name, email, password }  ->  { success, token, user }

require_once __DIR__ . '/auth_common.php';

auth_headers('POST, OPTIONS');
require_method(['POST']);

$data     = json_body();
$name     = trim($data['name'] ?? '');
$email    = strtolower(trim($data['email'] ?? ''));
$password = (string) ($data['password'] ?? '');

if ($name === '' || mb_strlen($name) > 100) {
    json_fail(400, 'Please enter your name.');
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 190) {
    json_fail(400, 'Please enter a valid email address.');
}
if (strlen($password) < 8) {
    json_fail(400, 'Password must be at least 8 characters.');
}

purge_expired();

$stmt = db()->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
$stmt->bind_param('s', $email);
$stmt->execute();
$exists = $stmt->get_result()->fetch_assoc();
$stmt->close();

if ($exists) {
    json_fail(409, 'An account with this email already exists.');
}

$id   = new_uuid();
$hash = password_hash($password, PASSWORD_DEFAULT);

$stmt = db()->prepare(
    'INSERT INTO users (id, name, email, password_hash, last_login_at)
     VALUES (?, ?, ?, ?, NOW())'
);
$stmt->bind_param('ssss', $id, $name, $email, $hash);

if (!$stmt->execute()) {
    $stmt->close();
    json_fail(500, 'Could not create the account. Please try again.');
}
$stmt->close();

json_ok([
    'token' => issue_session($id),
    'user'  => ['id' => $id, 'name' => $name, 'email' => $email],
]);
