<?php
// GET /api/auth_me.php — who is this token? Used to restore a session on page
// load. Returns 401 when the token is missing, unknown or expired.
// Header: Authorization: Bearer <token>  ->  { success, user }

require_once __DIR__ . '/auth_common.php';
require_once __DIR__ . '/interior_access.php';

auth_headers('GET, OPTIONS');
require_method(['GET']);

json_ok(['user' => ia_public_user(require_principal())]);
