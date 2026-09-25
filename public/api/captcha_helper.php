<?php
// captcha_helper.php
// Self-hosted, stateless math CAPTCHA — no third-party service (reCAPTCHA/
// hCaptcha/etc.) and no server-side session or DB storage between the two
// requests. captcha_generate() signs the expected answer + an expiry with
// HMAC-SHA256 into an opaque token handed to the client; captcha_verify()
// re-derives the signature from the client-submitted answer and compares.
// Not an endpoint itself — always require_once'd.

if (!defined('DB_HOST')) {
    require_once __DIR__ . '/db-config.php';
}

function captcha_secret(): string {
    if (defined('CAPTCHA_SECRET') && CAPTCHA_SECRET !== '') {
        return CAPTCHA_SECRET;
    }
    // Falls back to a secret derived from existing config so this works with
    // no db-config.php changes; define CAPTCHA_SECRET there for a dedicated key.
    return hash('sha256', DB_PASS . '|' . (defined('ADMIN_PIN') ? ADMIN_PIN : 'preinvesto-captcha'));
}

/** Builds a new math question + a signed token proving the expected answer. */
function captcha_generate(): array {
    $a = random_int(10, 50);
    $b = random_int(10, 50);
    if (random_int(0, 1) === 0) {
        $question = "$a + $b";
        $answer   = $a + $b;
    } else {
        // Keep subtraction non-negative.
        $hi = max($a, $b);
        $lo = min($a, $b);
        $question = "$hi - $lo";
        $answer   = $hi - $lo;
    }

    $expires = time() + 600; // 10 minutes
    $payload = $answer . ':' . $expires;
    $token   = base64_encode($payload) . '.' . hash_hmac('sha256', $payload, captcha_secret());

    return ['question' => $question, 'token' => $token];
}

/** Verifies a client-submitted answer against the token from captcha_generate(). */
function captcha_verify(?string $token, $answer): bool {
    if (!$token || strpos($token, '.') === false) return false;

    [$encoded, $signature] = explode('.', $token, 2);
    $payload = base64_decode($encoded, true);
    if ($payload === false) return false;

    $expected = hash_hmac('sha256', $payload, captcha_secret());
    if (!hash_equals($expected, $signature)) return false;

    $parts = explode(':', $payload, 2);
    if (count($parts) !== 2) return false;
    [$expectedAnswer, $expires] = $parts;

    if ((int)$expires < time()) return false; // expired

    return (string)(int)$answer === (string)(int)$expectedAnswer;
}
