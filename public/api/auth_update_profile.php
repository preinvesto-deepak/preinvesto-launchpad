<?php
// POST /api/auth_update_profile.php — update the signed-in user's details.
// Header: Authorization: Bearer <token>
// Body: { name, email, mobile }  ->  { success, user }

require_once __DIR__ . '/auth_common.php';

auth_headers('POST, OPTIONS');
require_method(['POST']);

$user = require_user();

$data   = json_body();
$name   = trim($data['name'] ?? '');
$email  = strtolower(trim($data['email'] ?? ''));
$mobile = preg_replace('/\D/', '', (string) ($data['mobile'] ?? ''));

if ($name === '' || mb_strlen($name) > 100) {
    json_fail(400, 'Please enter your name.');
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 190) {
    json_fail(400, 'Please enter a valid email address.');
}
if (!preg_match('/^[0-9]{10}$/', $mobile)) {
    json_fail(400, 'Please enter a valid 10-digit mobile number.');
}

// Email is the login identifier, so it has to stay unique — but the user's
// own row obviously doesn't count as a clash.
$stmt = db()->prepare('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1');
$stmt->bind_param('ss', $email, $user['id']);
$stmt->execute();
$taken = $stmt->get_result()->fetch_assoc();
$stmt->close();

if ($taken) {
    json_fail(409, 'That email is already used by another account.');
}

$stmt = db()->prepare('UPDATE users SET name = ?, email = ?, mobile = ? WHERE id = ?');
$stmt->bind_param('ssss', $name, $email, $mobile, $user['id']);

if (!$stmt->execute()) {
    $stmt->close();
    json_fail(500, 'Could not save your changes.');
}
$stmt->close();

json_ok([
    'user' => ['id' => $user['id'], 'name' => $name, 'email' => $email, 'mobile' => $mobile],
]);
