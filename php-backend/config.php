<?php

declare(strict_types=1);

function loadEnvironment(): void
{
    static $loaded = false;
    if ($loaded) {
        return;
    }

    $path = __DIR__ . DIRECTORY_SEPARATOR . '.env';
    if (is_file($path)) {
        foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
                continue;
            }
            [$key, $value] = explode('=', $line, 2);
            $key = trim($key);
            $value = trim($value);
            if ($key !== '' && getenv($key) === false) {
                putenv("{$key}={$value}");
            }
        }
    }
    $loaded = true;
}

function envValue(string $key, string $fallback = ''): string
{
    loadEnvironment();
    $value = getenv($key);
    return $value === false ? $fallback : $value;
}

function database(): PDO
{
    static $pdo;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $host = envValue('PINGME_DB_HOST', '127.0.0.1');
    $port = envValue('PINGME_DB_PORT', '3306');
    $name = envValue('PINGME_DB_NAME', 'pingme');
    $user = envValue('PINGME_DB_USER', 'root');
    $password = envValue('PINGME_DB_PASSWORD');
    $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";

    $pdo = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $pdo;
}

function jsonResponse(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function requestBody(): array
{
    $body = json_decode(file_get_contents('php://input'), true);
    return is_array($body) ? $body : [];
}

function uuid(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
}

function tokenFor(array $user): string
{
    $secret = envValue('PINGME_JWT_SECRET', 'local-development-secret');
    $header = rtrim(strtr(base64_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT'])), '+/', '-_'), '=');
    $payload = rtrim(strtr(base64_encode(json_encode([
        'sub' => $user['id'],
        'email' => $user['email'],
        'exp' => time() + 7200,
    ])), '+/', '-_'), '=');
    $signature = hash_hmac('sha256', "{$header}.{$payload}", $secret, true);
    return "{$header}.{$payload}." . rtrim(strtr(base64_encode($signature), '+/', '-_'), '=');
}

function authorizationHeader(): string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if ($header === '' && function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $value) {
            if (strtolower($name) === 'authorization') {
                return $value;
            }
        }
    }
    return $header;
}

function authenticatedUserId(): string
{
    $header = authorizationHeader();
    if (!str_starts_with($header, 'Bearer ')) {
        jsonResponse(['message' => 'Authentication required'], 401);
    }

    $parts = explode('.', substr($header, 7));
    if (count($parts) !== 3) {
        jsonResponse(['message' => 'Session expired'], 401);
    }

    $payload = json_decode(base64_decode(strtr($parts[1], '-_', '+/')), true);
    $secret = envValue('PINGME_JWT_SECRET', 'local-development-secret');
    $expected = rtrim(strtr(base64_encode(hash_hmac('sha256', "{$parts[0]}.{$parts[1]}", $secret, true)), '+/', '-_'), '=');

    if (!is_array($payload) || !hash_equals($expected, $parts[2]) || ($payload['exp'] ?? 0) < time()) {
        jsonResponse(['message' => 'Session expired'], 401);
    }

    return (string) $payload['sub'];
}
