<?php
// POST /api/update_review.php — update review_status of a property (admin only)

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

require_once __DIR__ . '/db-config.php';

$data          = json_decode(file_get_contents('php://input'), true);
$id            = trim($data['id']            ?? '');
$review_status = trim($data['review_status'] ?? '');

$allowed = ['pending', 'approved', 'rejected', 'flagged'];
if (empty($id) || !in_array($review_status, $allowed, true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing or invalid id / review_status']);
    exit;
}

$mysqli = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT);
if ($mysqli->connect_error) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed']);
    exit;
}

$stmt = $mysqli->prepare('UPDATE properties SET review_status = ? WHERE id = ?');
$stmt->bind_param('ss', $review_status, $id);

if (!$stmt->execute()) {
    http_response_code(500);
    echo json_encode(['error' => 'Update failed']);
    $mysqli->close();
    exit;
}

$affected = $stmt->affected_rows;
$stmt->close();
$mysqli->close();

if ($affected === 0) {
    http_response_code(404);
    echo json_encode(['error' => 'Property not found']);
    exit;
}

echo json_encode(['success' => true]);
