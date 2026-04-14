<?php
// GET /api/cron_expire_sold.php?key=CRON_SECRET
// Marks sold/rented properties older than 90 days as 'expired'
// Schedule this to run daily via cPanel cron:
//   curl -s "https://preinvesto.com/api/cron_expire_sold.php?key=YOUR_CRON_SECRET" > /dev/null

header('Content-Type: application/json');

require_once __DIR__ . '/db-config.php';

// Verify secret key to prevent unauthorised calls
$key = $_GET['key'] ?? '';
if (!defined('CRON_SECRET') || $key !== CRON_SECRET) {
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden']);
    exit;
}

$mysqli = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT);
if ($mysqli->connect_error) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed']);
    exit;
}

$result = $mysqli->query(
    "UPDATE properties
     SET status = 'expired'
     WHERE status IN ('sold','rented')
       AND sold_at IS NOT NULL
       AND sold_at < DATE_SUB(NOW(), INTERVAL 90 DAY)"
);

$affected = $mysqli->affected_rows;
$mysqli->close();

echo json_encode([
    'success'  => true,
    'expired'  => $affected,
    'ran_at'   => date('Y-m-d H:i:s'),
]);
