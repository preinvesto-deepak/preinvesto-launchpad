<?php
// POST /api/upload_image.php — upload a property image to /uploads/properties/
// Returns: { "url": "/uploads/properties/filename.jpg" }

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

if (!isset($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['error' => 'No image uploaded or upload error: ' . ($_FILES['image']['error'] ?? 'missing')]);
    exit;
}

$file         = $_FILES['image'];
$allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
$maxSize      = 5 * 1024 * 1024; // 5MB

if (!in_array($file['type'], $allowedTypes)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid file type. Only JPG, PNG, WEBP allowed']);
    exit;
}

if ($file['size'] > $maxSize) {
    http_response_code(400);
    echo json_encode(['error' => 'File too large. Maximum 5MB']);
    exit;
}

// Build unique filename: 20260412_153045_a1b2c3d4.jpg
$ext       = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
$filename  = date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
$uploadDir = __DIR__ . '/../uploads/properties/';

if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

if (!move_uploaded_file($file['tmp_name'], $uploadDir . $filename)) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save image']);
    exit;
}

echo json_encode(['url' => '/uploads/properties/' . $filename]);
