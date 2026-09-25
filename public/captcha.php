<?php
// captcha.php — issues a self-hosted math CAPTCHA challenge for the contact
// form (see api/captcha_helper.php). Sits at the site root, not under /api/,
// so it matches send_contact_email.php and isn't caught by the dev-server's
// /api proxy to the Express mirror.

require_once __DIR__ . '/api/captcha_helper.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'Preflight OK']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

echo json_encode(array_merge(['success' => true], captcha_generate()));
