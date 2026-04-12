<?php
// POST /api/add_property.php — insert a new property record into MySQL
// Expects JSON body with snake_case field names
// Returns: { "success": true, "id": "<uuid>" }

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

$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);

if (json_last_error() !== JSON_ERROR_NONE || !is_array($data)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON payload']);
    exit;
}

// Helper: get nullable value
function nval($arr, $key) {
    return isset($arr[$key]) && $arr[$key] !== '' ? $arr[$key] : null;
}

// Required field check
$required = ['listing_type','property_type','listed_by','title','description',
             'price','city','locality','built_up_area','furnishing','parking',
             'property_age','possession_status','featured_image','contact_name','contact_phone'];
foreach ($required as $field) {
    if (empty($data[$field]) && $data[$field] !== 0 && $data[$field] !== false) {
        http_response_code(400);
        echo json_encode(['error' => "Missing required field: $field"]);
        exit;
    }
}

require_once __DIR__ . '/db-config.php';

$mysqli = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT);

if ($mysqli->connect_error) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed']);
    exit;
}

// Generate UUID in PHP (v4)
$id = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
    mt_rand(0, 0xffff), mt_rand(0, 0xffff),
    mt_rand(0, 0xffff),
    mt_rand(0, 0x0fff) | 0x4000,
    mt_rand(0, 0x3fff) | 0x8000,
    mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
);

// JSON-encode array fields
$amenities     = json_encode(isset($data['amenities'])     && is_array($data['amenities'])     ? $data['amenities']     : []);
$galleryImages = json_encode(isset($data['gallery_images']) && is_array($data['gallery_images']) ? $data['gallery_images'] : []);

$stmt = $mysqli->prepare(
    'INSERT INTO properties (
        id, listing_type, property_type, listed_by, title, description, price,
        rent_per_month, security_deposit, maintenance_charges, negotiable,
        city, locality, project_name, full_address, landmark, pincode,
        lat, lng, built_up_area, carpet_area, bedrooms, bathrooms, balconies,
        floor, total_floors, facing, furnishing, parking, property_age,
        availability_date, possession_status, amenities, featured_image,
        gallery_images, video_url, contact_name, contact_phone, contact_email,
        prefer_whatsapp
    ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?
    )'
);

if (!$stmt) {
    http_response_code(500);
    echo json_encode(['error' => 'Prepare failed: ' . $mysqli->error]);
    $mysqli->close();
    exit;
}

$negotiable     = isset($data['negotiable'])      && $data['negotiable']      ? 1 : 0;
$preferWhatsapp = isset($data['prefer_whatsapp']) && $data['prefer_whatsapp'] ? 1 : 0;

$stmt->bind_param(
    'ssssssddddissssssddiddddiiisssssssssssssi',
    $id,
    $data['listing_type'],
    $data['property_type'],
    $data['listed_by'],
    $data['title'],
    $data['description'],
    $data['price'],
    $data['rent_per_month'],
    $data['security_deposit'],
    $data['maintenance_charges'],
    $negotiable,
    $data['city'],
    $data['locality'],
    $data['project_name'],
    $data['full_address'],
    $data['landmark'],
    $data['pincode'],
    $data['lat'],
    $data['lng'],
    $data['built_up_area'],
    $data['carpet_area'],
    $data['bedrooms'],
    $data['bathrooms'],
    $data['balconies'],
    $data['floor'],
    $data['total_floors'],
    $data['facing'],
    $data['furnishing'],
    $data['parking'],
    $data['property_age'],
    $data['availability_date'],
    $data['possession_status'],
    $amenities,
    $data['featured_image'],
    $galleryImages,
    $data['video_url'],
    $data['contact_name'],
    $data['contact_phone'],
    $data['contact_email'],
    $preferWhatsapp
);

if (!$stmt->execute()) {
    http_response_code(500);
    echo json_encode(['error' => 'Insert failed: ' . $stmt->error]);
    $stmt->close();
    $mysqli->close();
    exit;
}

$stmt->close();
$mysqli->close();

echo json_encode(['success' => true, 'id' => $id]);
