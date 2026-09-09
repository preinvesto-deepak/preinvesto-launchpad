<?php
// POST /api/auth_logout.php — revoke the current session token server-side.
// Header: Authorization: Bearer <token>  ->  { success }
// Always reports success: logging out an already-invalid token is not an error.

require_once __DIR__ . '/auth_common.php';

auth_headers('POST, OPTIONS');
require_method(['POST']);

$token = bearer_token();

if ($token !== '') {
    $stmt = db()->prepare('DELETE FROM user_sessions WHERE token_hash = ?');
    $hash = hash('sha256', $token);
    $stmt->bind_param('s', $hash);
    $stmt->execute();
    $stmt->close();
}

json_ok();
