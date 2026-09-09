<?php
// POST /api/auth_forgot_password.php — email a single-use reset link.
// Body: { email }  ->  { success }
//
// Always reports success, even for addresses with no account, so this can't be
// used to find out who has registered.

require_once __DIR__ . '/auth_common.php';

auth_headers('POST, OPTIONS');
require_method(['POST']);

$data  = json_body();
$email = strtolower(trim($data['email'] ?? ''));

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_fail(400, 'Please enter a valid email address.');
}

purge_expired();

$stmt = db()->prepare('SELECT id, name FROM users WHERE email = ? LIMIT 1');
$stmt->bind_param('s', $email);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();
$stmt->close();

if ($user) {
    // Invalidate any earlier unused links for this account.
    $stmt = db()->prepare('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL');
    $stmt->bind_param('s', $user['id']);
    $stmt->execute();
    $stmt->close();

    $token = bin2hex(random_bytes(32));
    $hash  = hash('sha256', $token);
    $ttl   = RESET_TTL_MINUTES;

    $stmt = db()->prepare(
        'INSERT INTO password_resets (token_hash, user_id, expires_at)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))'
    );
    $stmt->bind_param('ssi', $hash, $user['id'], $ttl);
    $stmt->execute();
    $stmt->close();

    // Base URL: explicit constant if db-config.php sets one, else derive it
    // from this request so the link works on any host it's deployed to.
    if (defined('APP_BASE_URL') && APP_BASE_URL !== '') {
        $base = rtrim(APP_BASE_URL, '/');
    } else {
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $base   = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'preinvesto.com');
    }
    $link = $base . '/reset-password?token=' . $token;

    $name    = $user['name'] !== '' ? $user['name'] : 'there';
    $subject = 'Reset your Preinvesto password';
    $body    = "Hi {$name},\r\n\r\n"
             . "We received a request to reset your Preinvesto password.\r\n\r\n"
             . "Open this link to choose a new one:\r\n{$link}\r\n\r\n"
             . "The link expires in " . RESET_TTL_MINUTES . " minutes and can only be used once.\r\n\r\n"
             . "If you didn't request this, you can safely ignore this email — your password won't change.\r\n";

    $headers = "From: \"Preinvesto\" <no-reply@preinvesto.com>\r\n"
             . "X-Mailer: PHP/" . phpversion();

    @mail($email, $subject, $body, $headers);
}

json_ok(['message' => 'If that email has an account, a reset link is on its way.']);
