<?php
// GET /api/sold_properties.php — returns latest 50 sold or rented properties

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit; }

require_once __DIR__ . '/db-config.php';
$mysqli = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT);
if ($mysqli->connect_error) { http_response_code(500); echo json_encode(['error' => 'DB connection failed']); exit; }

$result = $mysqli->query(
    "SELECT * FROM properties WHERE status IN ('sold','rented') ORDER BY created_at DESC LIMIT 50"
);
if (!$result) { http_response_code(500); echo json_encode(['error' => 'Query failed']); $mysqli->close(); exit; }

$properties = [];
while ($row = $result->fetch_assoc()) {
    $row['amenities']      = json_decode($row['amenities']      ?? '[]');
    $row['gallery_images'] = json_decode($row['gallery_images'] ?? '[]');
    $row['price']               = $row['price']               !== null ? (float)$row['price']               : null;
    $row['rent_per_month']      = $row['rent_per_month']      !== null ? (float)$row['rent_per_month']      : null;
    $row['security_deposit']    = $row['security_deposit']    !== null ? (float)$row['security_deposit']    : null;
    $row['maintenance_charges'] = $row['maintenance_charges'] !== null ? (float)$row['maintenance_charges'] : null;
    $row['lat']             = $row['lat']  !== null ? (float)$row['lat']  : null;
    $row['lng']             = $row['lng']  !== null ? (float)$row['lng']  : null;
    $row['built_up_area']   = $row['built_up_area']  !== null ? (int)$row['built_up_area']  : null;
    $row['carpet_area']     = $row['carpet_area']    !== null ? (int)$row['carpet_area']    : null;
    $row['bedrooms']        = $row['bedrooms']       !== null ? (int)$row['bedrooms']       : null;
    $row['bathrooms']       = $row['bathrooms']      !== null ? (int)$row['bathrooms']      : null;
    $row['balconies']       = $row['balconies']      !== null ? (int)$row['balconies']      : null;
    $row['floor']           = $row['floor']          !== null ? (int)$row['floor']          : null;
    $row['total_floors']    = $row['total_floors']   !== null ? (int)$row['total_floors']   : null;
    $row['negotiable']      = (bool)$row['negotiable'];
    $row['prefer_whatsapp'] = (bool)$row['prefer_whatsapp'];
    $properties[] = $row;
}
$result->free(); $mysqli->close();
echo json_encode($properties);
