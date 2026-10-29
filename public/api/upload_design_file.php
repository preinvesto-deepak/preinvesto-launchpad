<?php
// POST /api/upload_design_file.php — upload a project Design file (CAD PDF or
// final-render image) to /uploads/design/. Signed-in users only.
// Form field: "file". Returns { success, url, size }.
// The extension is chosen from the detected type, never from the uploaded
// filename, and the stored name is random so URLs can't be guessed.

require_once __DIR__ . '/auth_common.php';

auth_headers('POST, OPTIONS');
require_method(['POST']);
require_user();

const DESIGN_MAX_MB = 25;

if (!isset($_FILES['file'])) {
    json_fail(400, 'No file uploaded.');
}
$file = $_FILES['file'];

if ($file['error'] !== UPLOAD_ERR_OK) {
    if ($file['error'] === UPLOAD_ERR_INI_SIZE || $file['error'] === UPLOAD_ERR_FORM_SIZE) {
        json_fail(400, 'File too large for this server (limit ' . ini_get('upload_max_filesize') . ').');
    }
    json_fail(400, 'Upload failed (code ' . $file['error'] . ').');
}
if ($file['size'] > DESIGN_MAX_MB * 1024 * 1024) {
    json_fail(400, 'File too large. Maximum ' . DESIGN_MAX_MB . 'MB.');
}

$types = [
    'application/pdf' => 'pdf',
    'image/jpeg'      => 'jpg',
    'image/png'       => 'png',
    'image/webp'      => 'webp',
];
$mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
if (!isset($types[$mime])) {
    json_fail(400, 'Only PDF, JPG, PNG or WEBP files are allowed.');
}

$dir = __DIR__ . '/../uploads/design/';
if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
    json_fail(500, 'Could not prepare the upload folder.');
}

$name = date('YmdHis') . '_' . bin2hex(random_bytes(12)) . '.' . $types[$mime];
if (!move_uploaded_file($file['tmp_name'], $dir . $name)) {
    json_fail(500, 'Failed to save the file.');
}

json_ok(['url' => '/uploads/design/' . $name, 'size' => (int)$file['size']]);
