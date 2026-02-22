<?php
// send_contact_email.php

// Always return JSON
header('Content-Type: application/json');

// Optional: allow CORS if you test from localhost or another origin
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'Preflight OK']);
    exit;
}

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

// Read JSON body
$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);

if (json_last_error() !== JSON_ERROR_NONE || !is_array($data)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON payload']);
    exit;
}

// Helper to safely get fields
function get_value($array, $key) {
    return isset($array[$key]) ? trim((string)$array[$key]) : '';
}

// Extract fields (must match your React "data" keys)
$name    = get_value($data, 'name');
$email   = get_value($data, 'email');
$phone   = get_value($data, 'phone');
$service = get_value($data, 'service');
$message = get_value($data, 'message');

// Basic validation
$errors = [];

if ($name === '') {
    $errors[] = 'Name is required.';
}

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors[] = 'Valid email is required.';
}

if ($message === '') {
    $errors[] = 'Message is required.';
}

if (!empty($errors)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Validation error',
        'errors'  => $errors,
    ]);
    exit;
}

// Your email settings
$toEmail = 'info@preinvesto.com';
$subject = 'New contact form submission from Preinvesto Interiors website';

// Build email body (plain text)
$emailBody = "You have received a new contact form submission:\n\n";
$emailBody .= "Name: {$name}\n";
$emailBody .= "Email: {$email}\n";
$emailBody .= "Phone: {$phone}\n";
if ($service !== '') {
    $emailBody .= "Service: {$service}\n";
}
$emailBody .= "Message:\n{$message}\n";
$emailBody .= "\n---\nSent from the contact form on preinvesto.com\n";

// Basic sanitization for headers (avoid header injection)
$cleanEmail = str_replace(["\r", "\n"], '', $email);
$cleanName  = str_replace(["\r", "\n"], '', $name);

// Email headers
$headers   = "From: \"Preinvesto Interiors\" <no-reply@preinvesto.com>\r\n";
$headers  .= "Reply-To: \"{$cleanName}\" <{$cleanEmail}>\r\n";
$headers  .= "X-Mailer: PHP/" . phpversion();

// Send the email
$mailSent = mail($toEmail, $subject, $emailBody, $headers);

if ($mailSent) {
    echo json_encode([
        'success' => true,
        'message' => 'Thank you! Your message has been sent. We will contact you soon.',
    ]);
} else {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Failed to send email. Please try again later.',
    ]);
}
