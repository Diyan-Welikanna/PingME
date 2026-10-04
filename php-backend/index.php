<?php

declare(strict_types=1);

require __DIR__ . '/config.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET' && $path === '/health') {
    jsonResponse(['status' => 'ok', 'service' => 'pingme-php-api']);
}

$pdo = database();

if ($method === 'POST' && $path === '/auth/register') {
    $body = requestBody();
    $email = strtolower(trim((string) ($body['email'] ?? '')));
    $username = strtolower(trim((string) ($body['username'] ?? '')));
    $name = trim((string) ($body['name'] ?? ''));
    $password = (string) ($body['password'] ?? '');

    if (!preg_match('/^[a-z0-9_]{3,40}$/', $username) || $email === '' || $name === '' || strlen($password) < 6) {
        jsonResponse(['message' => 'Username must be 3-40 characters using letters, numbers, or underscores; name, email, and a password of at least 6 characters are required'], 400);
    }

    $check = $pdo->prepare('SELECT id FROM users WHERE email = ? OR username = ?');
    $check->execute([$email, $username]);
    if ($check->fetch()) {
        jsonResponse(['message' => 'Email or username already exists'], 409);
    }

    $user = ['id' => uuid(), 'username' => $username, 'email' => $email, 'name' => $name];
    $insert = $pdo->prepare('INSERT INTO users (id, username, email, name, password_hash) VALUES (?, ?, ?, ?, ?)');
    $insert->execute([$user['id'], $user['username'], $user['email'], $user['name'], password_hash($password, PASSWORD_DEFAULT)]);
    jsonResponse(['token' => tokenFor($user), 'user' => $user], 201);
}

if ($method === 'POST' && $path === '/auth/login') {
    $body = requestBody();
    $identifier = strtolower(trim((string) ($body['identifier'] ?? $body['email'] ?? '')));
    $password = (string) ($body['password'] ?? '');
    $query = $pdo->prepare('SELECT id, username, email, name, password_hash FROM users WHERE email = ? OR username = ?');
    $query->execute([$identifier, $identifier]);
    $record = $query->fetch();

    if (!$record || !password_verify($password, $record['password_hash'])) {
        jsonResponse(['message' => 'Invalid email or password'], 401);
    }

    $user = ['id' => $record['id'], 'username' => $record['username'], 'email' => $record['email'], 'name' => $record['name']];
    jsonResponse(['token' => tokenFor($user), 'user' => $user]);
}

$userId = authenticatedUserId();

if ($method === 'GET' && $path === '/me') {
    $query = $pdo->prepare('SELECT id, username, email, name, location_sharing_enabled AS locationSharingEnabled FROM users WHERE id = ?');
    $query->execute([$userId]);
    $user = $query->fetch();
    if (!$user) {
        jsonResponse(['message' => 'User not found'], 404);
    }

    $locationQuery = $pdo->prepare('SELECT user_id AS userId, latitude, longitude, updated_at AS updatedAt FROM locations WHERE user_id = ?');
    $locationQuery->execute([$userId]);
    jsonResponse(['user' => $user, 'location' => $locationQuery->fetch() ?: null]);
}

if ($method === 'GET' && $path === '/users/search') {
    $term = trim((string) ($_GET['q'] ?? ''));
    if (strlen($term) < 2) {
        jsonResponse(['message' => 'Search query must be at least 2 characters'], 400);
    }
    $like = '%' . $term . '%';
    $query = $pdo->prepare(
        'SELECT id, username, name, email FROM users
         WHERE id <> ? AND (username LIKE ? OR name LIKE ? OR email LIKE ?)
         ORDER BY username LIMIT 20'
    );
    $query->execute([$userId, $like, $like, $like]);
    jsonResponse(['users' => $query->fetchAll()]);
}

if ($method === 'GET' && $path === '/friends') {
    $query = $pdo->prepare(
        'SELECT u.id, u.username, u.name, u.email, u.location_sharing_enabled AS locationSharingEnabled
         FROM users u
         WHERE EXISTS (
             SELECT 1 FROM friend_requests fr
             WHERE fr.status = \'accepted\'
               AND ((fr.sender_id = ? AND fr.receiver_id = u.id) OR (fr.receiver_id = ? AND fr.sender_id = u.id))
         ) ORDER BY u.name'
    );
    $query->execute([$userId, $userId]);
    jsonResponse(['friends' => $query->fetchAll()]);
}

if ($method === 'GET' && $path === '/friend-requests') {
    $query = $pdo->prepare(
        'SELECT fr.id, fr.status, fr.created_at AS createdAt, fr.responded_at AS respondedAt,
                s.id AS senderId, s.username AS senderUsername, s.name AS senderName,
                r.id AS receiverId, r.username AS receiverUsername, r.name AS receiverName
         FROM friend_requests fr
         JOIN users s ON s.id = fr.sender_id
         JOIN users r ON r.id = fr.receiver_id
         WHERE fr.sender_id = ? OR fr.receiver_id = ?
         ORDER BY fr.created_at DESC'
    );
    $query->execute([$userId, $userId]);
    jsonResponse(['requests' => $query->fetchAll()]);
}

if ($method === 'POST' && $path === '/friend-requests') {
    $body = requestBody();
    $target = strtolower(trim((string) ($body['userId'] ?? $body['username'] ?? '')));
    $query = $pdo->prepare('SELECT id, username, name FROM users WHERE id = ? OR username = ?');
    $query->execute([$target, $target]);
    $targetUser = $query->fetch();
    if (!$targetUser || $targetUser['id'] === $userId) {
        jsonResponse(['message' => 'A valid other user is required'], 400);
    }

    $existing = $pdo->prepare(
        'SELECT id, sender_id, receiver_id, status FROM friend_requests
         WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
         ORDER BY created_at DESC LIMIT 1'
    );
    $existing->execute([$userId, $targetUser['id'], $targetUser['id'], $userId]);
    $request = $existing->fetch();
    if ($request && $request['status'] === 'accepted') {
        jsonResponse(['message' => 'You are already friends'], 409);
    }
    if ($request && $request['status'] === 'pending') {
        jsonResponse(['message' => 'A friend request is already pending'], 409);
    }

    $insert = $pdo->prepare('INSERT INTO friend_requests (id, sender_id, receiver_id) VALUES (?, ?, ?)');
    $insert->execute([uuid(), $userId, $targetUser['id']]);
    jsonResponse(['message' => 'Friend request sent', 'user' => $targetUser], 201);
}

if (preg_match('#^/friend-requests/([^/]+)/(accept|decline)$#', $path, $matches) && $method === 'POST') {
    $requestId = $matches[1];
    $decision = $matches[2] === 'accept' ? 'accepted' : 'declined';
    $query = $pdo->prepare('SELECT id, sender_id, receiver_id, status FROM friend_requests WHERE id = ? AND receiver_id = ?');
    $query->execute([$requestId, $userId]);
    $request = $query->fetch();
    if (!$request || $request['status'] !== 'pending') {
        jsonResponse(['message' => 'Pending incoming friend request not found'], 404);
    }
    $update = $pdo->prepare('UPDATE friend_requests SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?');
    $update->execute([$decision, $requestId]);
    jsonResponse(['message' => "Friend request {$decision}"]);
}

if ($method === 'POST' && $path === '/me/location-sharing') {
    $body = requestBody();
    $enabled = filter_var($body['enabled'] ?? null, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
    if ($enabled === null) {
        jsonResponse(['message' => 'enabled must be boolean'], 400);
    }
    $update = $pdo->prepare('UPDATE users SET location_sharing_enabled = ? WHERE id = ?');
    $update->execute([$enabled ? 1 : 0, $userId]);
    jsonResponse(['locationSharingEnabled' => $enabled]);
}

if ($method === 'GET' && $path === '/locations') {
    $query = $pdo->prepare(
        'SELECT l.user_id AS userId, u.username, u.name, l.latitude, l.longitude, l.updated_at AS updatedAt
         FROM locations l JOIN users u ON u.id = l.user_id
         WHERE u.location_sharing_enabled = 1
           AND (l.user_id = ? OR EXISTS (
               SELECT 1 FROM friend_requests fr
               WHERE fr.status = \'accepted\'
                 AND ((fr.sender_id = ? AND fr.receiver_id = l.user_id) OR (fr.receiver_id = ? AND fr.sender_id = l.user_id))
           ))
         ORDER BY l.updated_at DESC'
    );
    $query->execute([$userId, $userId, $userId]);
    $locations = $query->fetchAll();
    jsonResponse(['locations' => $locations]);
}

if ($method === 'POST' && $path === '/locations') {
    $body = requestBody();
    $latitude = filter_var($body['latitude'] ?? null, FILTER_VALIDATE_FLOAT);
    $longitude = filter_var($body['longitude'] ?? null, FILTER_VALIDATE_FLOAT);
    if ($latitude === false || $longitude === false || $latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180) {
        jsonResponse(['message' => 'Valid coordinates are required'], 400);
    }

    $userQuery = $pdo->prepare('SELECT name FROM users WHERE id = ?');
    $userQuery->execute([$userId]);
    $user = $userQuery->fetch();
    if (!$user) {
        jsonResponse(['message' => 'User not found'], 404);
    }

    $upsert = $pdo->prepare(
        'INSERT INTO locations (user_id, latitude, longitude) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE latitude = VALUES(latitude), longitude = VALUES(longitude), updated_at = CURRENT_TIMESTAMP'
    );
    $upsert->execute([$userId, $latitude, $longitude]);
    $history = $pdo->prepare('INSERT INTO location_history (user_id, latitude, longitude) VALUES (?, ?, ?)');
    $history->execute([$userId, $latitude, $longitude]);
    $location = ['userId' => $userId, 'name' => $user['name'], 'latitude' => (float) $latitude, 'longitude' => (float) $longitude, 'updatedAt' => date(DATE_ATOM)];
    jsonResponse(['location' => $location], 201);
}

jsonResponse(['message' => 'Route not found'], 404);
