<?php
// POST /api/auth_login.php — exchange email + password for a session token.
// Body: { email, password }  ->  { success, token, user }

require_once __DIR__ . '/auth_common.php';
require_once __DIR__ . '/interior_access.php';

auth_headers('POST, OPTIONS');
require_method(['POST']);

$data     = json_body();
$email    = strtolower(trim($data['email'] ?? ''));
$password = (string) ($data['password'] ?? '');

if ($email === '' || $password === '') {
    json_fail(400, 'Email and password are required.');
}

purge_expired();

// No "@" means a username: an employee the owner added under Teams.
if (strpos($email, '@') === false) {
    ia_ensure_team_tables();
    $stmt = db()->prepare(IA_EMPLOYEE_SELECT . ' WHERE e.username = ? LIMIT 1');
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $emp = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $hash = '';
    if ($emp) {
        $stmt = db()->prepare('SELECT password_hash FROM interior_employees WHERE id = ?');
        $stmt->bind_param('s', $emp['id']);
        $stmt->execute();
        $hash = (string) ($stmt->get_result()->fetch_assoc()['password_hash'] ?? '');
        $stmt->close();
    }
    if (!$emp || !$emp['active'] || !password_verify($password, $hash)) {
        json_fail(401, 'Incorrect username or password.');
    }

    $stmt = db()->prepare('UPDATE interior_employees SET last_login_at = NOW() WHERE id = ?');
    $stmt->bind_param('s', $emp['id']);
    $stmt->execute();
    $stmt->close();

    json_ok([
        'token' => ia_issue_employee_session($emp['id']),
        'user'  => ia_public_user(ia_build_principal($emp)),
    ]);
}

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
