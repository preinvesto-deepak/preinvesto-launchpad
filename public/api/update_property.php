<?php
// POST /api/update_property.php — update an existing property
// Body: same as add_property.php but includes "id"

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit; }

$data = json_decode(file_get_contents('php://input'), true);
if (json_last_error() !== JSON_ERROR_NONE || empty($data['id'])) {
    http_response_code(400); echo json_encode(['error' => 'Invalid payload or missing id']); exit;
}

require_once __DIR__ . '/db-config.php';
$mysqli = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT);
if ($mysqli->connect_error) { http_response_code(500); echo json_encode(['error' => 'DB connection failed']); exit; }

$amenities     = json_encode(isset($data['amenities'])      && is_array($data['amenities'])      ? $data['amenities']      : []);
$galleryImages = json_encode(isset($data['gallery_images']) && is_array($data['gallery_images']) ? $data['gallery_images'] : []);
$negotiable            = isset($data['negotiable'])              && $data['negotiable']              ? 1 : 0;
$preferWhatsapp        = isset($data['prefer_whatsapp'])         && $data['prefer_whatsapp']         ? 1 : 0;
$isNewProject          = isset($data['is_new_project'])          && $data['is_new_project']          ? 1 : 0;
$electricityConnection = isset($data['electricity_connection'])  && $data['electricity_connection']  ? 1 : 0;
$waterSupply           = isset($data['water_supply'])            && $data['water_supply']            ? 1 : 0;
$sewageConnection      = isset($data['sewage_connection'])       && $data['sewage_connection']       ? 1 : 0;

$propertyCategory = $data['property_category'] ?? null;
$plotLength       = isset($data['plot_length'])       ? (float)$data['plot_length']       : null;
$plotWidth        = isset($data['plot_width'])        ? (float)$data['plot_width']        : null;
$plotArea         = isset($data['plot_area'])         ? (float)$data['plot_area']         : null;
$ownership        = $data['ownership']        ?? null;
$facingRoadWidth  = isset($data['facing_road_width']) ? (float)$data['facing_road_width'] : null;
$boundaryWall     = $data['boundary_wall']    ?? null;
$floorsAllowed    = isset($data['floors_allowed'])    ? (int)$data['floors_allowed']      : null;

$stmt = $mysqli->prepare(
    'UPDATE properties SET
        listing_type=?, property_type=?, listed_by=?, title=?, description=?,
        price=?, rent_per_month=?, security_deposit=?, maintenance_charges=?, negotiable=?,
        city=?, locality=?, project_name=?, full_address=?, landmark=?, pincode=?,
        lat=?, lng=?, built_up_area=?, carpet_area=?, bedrooms=?, bathrooms=?,
        balconies=?, floor=?, total_floors=?, facing=?, furnishing=?, parking=?,
        property_age=?, availability_date=?, possession_status=?, amenities=?,
        featured_image=?, gallery_images=?, video_url=?, contact_name=?,
        contact_phone=?, contact_email=?, prefer_whatsapp=?,
        property_category=?, is_new_project=?,
        plot_length=?, plot_width=?, plot_area=?, ownership=?, facing_road_width=?,
        boundary_wall=?, electricity_connection=?, water_supply=?, sewage_connection=?, floors_allowed=?
    WHERE id=?'
);

if (!$stmt) { http_response_code(500); echo json_encode(['error' => 'Prepare failed: ' . $mysqli->error]); $mysqli->close(); exit; }

$stmt->bind_param(
    'sssssddddissssssddiddddiiisssssssssssssissidddssiiiis',
    $data['listing_type'],   $data['property_type'],   $data['listed_by'],
    $data['title'],          $data['description'],      $data['price'],
    $data['rent_per_month'], $data['security_deposit'], $data['maintenance_charges'],
    $negotiable,
    $data['city'],           $data['locality'],         $data['project_name'],
    $data['full_address'],   $data['landmark'],         $data['pincode'],
    $data['lat'],            $data['lng'],
    $data['built_up_area'],  $data['carpet_area'],
    $data['bedrooms'],       $data['bathrooms'],        $data['balconies'],
    $data['floor'],          $data['total_floors'],     $data['facing'],
    $data['furnishing'],     $data['parking'],          $data['property_age'],
    $data['availability_date'], $data['possession_status'],
    $amenities,              $data['featured_image'],   $galleryImages,
    $data['video_url'],      $data['contact_name'],
    $data['contact_phone'],  $data['contact_email'],    $preferWhatsapp,
    $propertyCategory,       $isNewProject,
    $plotLength,             $plotWidth,                $plotArea,
    $ownership,              $facingRoadWidth,
    $boundaryWall,           $electricityConnection,    $waterSupply,
    $sewageConnection,       $floorsAllowed,
    $data['id']
);

if (!$stmt->execute()) {
    http_response_code(500); echo json_encode(['error' => 'Update failed: ' . $stmt->error]);
    $stmt->close(); $mysqli->close(); exit;
}
$stmt->close(); $mysqli->close();
echo json_encode(['success' => true]);
