<?php
// GET /api/properties.php — returns all properties as JSON, ordered newest first

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

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

// Show available properties + sold/rented within 90 days, exclude rejected/expired
$result = $mysqli->query(
    "SELECT * FROM properties
     WHERE review_status != 'rejected'
       AND status != 'expired'
       AND (
             status = 'available'
             OR (status IN ('sold','rented') AND sold_at IS NOT NULL AND sold_at >= DATE_SUB(NOW(), INTERVAL 90 DAY))
           )
     ORDER BY created_at DESC"
);

if (!$result) {
    http_response_code(500);
    echo json_encode(['error' => 'Query failed']);
    $mysqli->close();
    exit;
}

$properties = [];

while ($row = $result->fetch_assoc()) {
    // Decode JSON columns (stored as JSON strings in MySQL)
    $row['amenities']      = json_decode($row['amenities'] ?? '[]');
    $row['gallery_images'] = json_decode($row['gallery_images'] ?? '[]');

    // Cast numeric fields
    $row['price']               = $row['price']               !== null ? (float)$row['price']               : null;
    $row['rent_per_month']      = $row['rent_per_month']      !== null ? (float)$row['rent_per_month']      : null;
    $row['security_deposit']    = $row['security_deposit']    !== null ? (float)$row['security_deposit']    : null;
    $row['maintenance_charges'] = $row['maintenance_charges'] !== null ? (float)$row['maintenance_charges'] : null;
    $row['lat']                 = $row['lat']                 !== null ? (float)$row['lat']                 : null;
    $row['lng']                 = $row['lng']                 !== null ? (float)$row['lng']                 : null;
    $row['built_up_area']       = $row['built_up_area']       !== null ? (int)$row['built_up_area']         : null;
    $row['carpet_area']         = $row['carpet_area']         !== null ? (int)$row['carpet_area']           : null;
    $row['bedrooms']            = $row['bedrooms']            !== null ? (int)$row['bedrooms']              : null;
    $row['bathrooms']           = $row['bathrooms']           !== null ? (int)$row['bathrooms']             : null;
    $row['balconies']           = $row['balconies']           !== null ? (int)$row['balconies']             : null;
    $row['floor']               = $row['floor']               !== null ? (int)$row['floor']                 : null;
    $row['total_floors']        = $row['total_floors']        !== null ? (int)$row['total_floors']          : null;
    $row['negotiable']              = (bool)$row['negotiable'];
    $row['prefer_whatsapp']         = (bool)$row['prefer_whatsapp'];
    $row['review_status']           = $row['review_status'] ?? 'pending';
    $row['is_new_project']          = (bool)($row['is_new_project'] ?? false);
    $row['electricity_connection']  = (bool)($row['electricity_connection'] ?? false);
    $row['water_supply']            = (bool)($row['water_supply'] ?? false);
    $row['sewage_connection']       = (bool)($row['sewage_connection'] ?? false);
    $row['plot_length']    = $row['plot_length']    !== null ? (float)$row['plot_length']    : null;
    $row['plot_width']     = $row['plot_width']     !== null ? (float)$row['plot_width']     : null;
    $row['plot_area']      = $row['plot_area']      !== null ? (float)$row['plot_area']      : null;
    $row['facing_road_width'] = $row['facing_road_width'] !== null ? (float)$row['facing_road_width'] : null;
    $row['floors_allowed'] = $row['floors_allowed'] !== null ? (int)$row['floors_allowed']   : null;

    $properties[] = $row;
}

$result->free();
$mysqli->close();

echo json_encode($properties);
