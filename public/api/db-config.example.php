<?php
// Template for public/api/db-config.php — the real file is gitignored because
// it holds live credentials. Copy this to db-config.php on the server and fill
// in the values.
//
// The properties endpoints already relied on DB_* and ADMIN_PIN; the auth and
// Interior-tool endpoints added APP_BASE_URL (optional).

define('DB_HOST', 'localhost');
define('DB_USER', 'your_db_user');
define('DB_PASS', 'your_db_password');
define('DB_NAME', 'your_db_name');
define('DB_PORT', 3306);

// Shared PIN for the existing /admin property-review area.
define('ADMIN_PIN', '0000');

// Used to build password-reset links in the emails sent by
// auth_forgot_password.php. Leave it out and the link is derived from the
// incoming request host instead, which is usually fine — set it explicitly if
// the site sits behind a proxy that rewrites Host.
define('APP_BASE_URL', 'https://preinvesto.com');
