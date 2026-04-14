<?php
// POST /api/delete_property.php
// Body: { "id": "uuid" }

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit; }

$data = json_decode(file_get_contents('php://input'), true);
if (empty($data['id'])) {
    http_response_code(400); echo json_encode(['error' => 'Missing id']); exit;
}

require_once __DIR__ . '/db-config.php';
$mysqli = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT);
if ($mysqli->connect_error) { http_response_code(500); echo json_encode(['error' => 'DB connection failed']); exit; }

$stmt = $mysqli->prepare('DELETE FROM properties WHERE id = ?');
$stmt->bind_param('s', $data['id']);
if (!$stmt->execute() || $stmt->affected_rows === 0) {
    http_response_code(404); echo json_encode(['error' => 'Property not found']); $stmt->close(); $mysqli->close(); exit;
}
$stmt->close(); $mysqli->close();
echo json_encode(['success' => true]);
