<?php
// GET /api/admin_review_properties.php — returns ALL properties for admin review

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

require_once __DIR__ . '/db-config.php';

$mysqli = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT);
if ($mysqli->connect_error) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed']);
    exit;
}

$result = $mysqli->query(
    'SELECT * FROM properties ORDER BY created_at DESC'
);

if (!$result) {
    http_response_code(500);
    echo json_encode(['error' => 'Query failed']);
    $mysqli->close();
    exit;
}

$properties = [];
while ($row = $result->fetch_assoc()) {
    $row['amenities']      = json_decode($row['amenities']      ?? '[]');
    $row['gallery_images'] = json_decode($row['gallery_images'] ?? '[]');
    $row['price']          = $row['price'] !== null ? (float)$row['price'] : null;
    $row['negotiable']             = (bool)$row['negotiable'];
    $row['prefer_whatsapp']        = (bool)$row['prefer_whatsapp'];
    $row['review_status']          = $row['review_status'] ?? 'pending';
    $row['is_new_project']         = (bool)($row['is_new_project'] ?? false);
    $row['electricity_connection'] = (bool)($row['electricity_connection'] ?? false);
    $row['water_supply']           = (bool)($row['water_supply'] ?? false);
    $row['sewage_connection']      = (bool)($row['sewage_connection'] ?? false);
    $row['plot_length']     = $row['plot_length']     !== null ? (float)$row['plot_length']     : null;
    $row['plot_width']      = $row['plot_width']      !== null ? (float)$row['plot_width']      : null;
    $row['plot_area']       = $row['plot_area']       !== null ? (float)$row['plot_area']       : null;
    $row['facing_road_width']= $row['facing_road_width'] !== null ? (float)$row['facing_road_width'] : null;
    $row['floors_allowed']  = $row['floors_allowed']  !== null ? (int)$row['floors_allowed']   : null;
    $properties[] = $row;
}

$result->free();
$mysqli->close();

echo json_encode($properties);
