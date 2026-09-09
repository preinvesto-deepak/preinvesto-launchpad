<?php
// Shared helpers for the auth endpoints (auth_*.php) and interior_state.php.
// Not an endpoint itself — always require_once'd.

require_once __DIR__ . '/db-config.php';

const SESSION_TTL_DAYS   = 30;  // how long a login stays valid
const RESET_TTL_MINUTES  = 60;  // how long a password-reset link stays valid

/** CORS + JSON headers. Pass the methods this endpoint accepts. */
function auth_headers(string $methods = 'POST, OPTIONS'): void {
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: ' . $methods);
    header('Access-Control-Allow-Headers: Content-Type, Authorization');

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit;
    }
}

/** Reject anything that isn't one of the allowed verbs. */
function require_method(array $allowed): void {
    if (!in_array($_SERVER['REQUEST_METHOD'], $allowed, true)) {
        json_fail(405, 'Method not allowed');
    }
}

function json_ok(array $payload = []): void {
    echo json_encode(array_merge(['success' => true], $payload));
    exit;
}

function json_fail(int $status, string $message): void {
    http_response_code($status);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

/** Decoded JSON request body, always an array. */
function json_body(): array {
    $data = json_decode(file_get_contents('php://input'), true);
    return is_array($data) ? $data : [];
}

function db(): mysqli {
    static $mysqli = null;
    if ($mysqli === null) {
        $mysqli = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT);
        if ($mysqli->connect_error) {
            json_fail(500, 'Database connection failed');
        }
        $mysqli->set_charset('utf8mb4');
    }
    return $mysqli;
}

/** RFC-4122-ish v4 UUID, matching the varchar(36) ids used by `properties`. */
function new_uuid(): string {
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}

/**
 * Issue a session token. The raw token goes to the client; only its SHA-256
 * hash is stored, so a database leak can't be replayed as a valid login.
 */
function issue_session(string $userId): string {
    $token = bin2hex(random_bytes(32));
    $stmt  = db()->prepare(
        'INSERT INTO user_sessions (token_hash, user_id, expires_at)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))'
    );
    $hash = hash('sha256', $token);
    $ttl  = SESSION_TTL_DAYS;
    $stmt->bind_param('ssi', $hash, $userId, $ttl);
    $stmt->execute();
    $stmt->close();
    return $token;
}

/** Bearer token from the Authorization header, or '' if absent. */
function bearer_token(): string {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if ($header === '' && function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        $header  = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }
    if (stripos($header, 'Bearer ') === 0) {
        return trim(substr($header, 7));
    }
    return '';
}

/**
 * The user behind the current request, or null. Expired sessions are treated
 * as absent (and cleaned up opportunistically).
 */
function current_user(): ?array {
    $token = bearer_token();
    if ($token === '') return null;

    $stmt = db()->prepare(
        'SELECT u.id, u.name, u.email
           FROM user_sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = ? AND s.expires_at > NOW()
          LIMIT 1'
    );
    $hash = hash('sha256', $token);
    $stmt->bind_param('s', $hash);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    return $user ?: null;
}

/** current_user(), but 401s instead of returning null. */
function require_user(): array {
    $user = current_user();
    if ($user === null) {
        json_fail(401, 'Not authenticated');
    }
    return $user;
}

/** Delete expired sessions and reset tokens. Cheap, runs on login/signup. */
function purge_expired(): void {
    db()->query('DELETE FROM user_sessions  WHERE expires_at < NOW()');
    db()->query('DELETE FROM password_resets WHERE expires_at < NOW()');
}
