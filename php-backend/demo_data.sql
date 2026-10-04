USE pingme;

-- Demo login password for all seeded accounts: PingMe123!
INSERT INTO users (id, username, email, name, password_hash, location_sharing_enabled) VALUES
    ('11111111-1111-4111-8111-111111111111', 'alexmorgan', 'alex@example.com', 'Alex Morgan', '$2y$10$Ow83t9rOLRd0nz2XivHVvumypkA6dE45gbMi/vJdMPG5V6DC2.ZUW', TRUE),
    ('22222222-2222-4222-8222-222222222222', 'sanawilliams', 'sana@example.com', 'Sana Williams', '$2y$10$Ow83t9rOLRd0nz2XivHVvumypkA6dE45gbMi/vJdMPG5V6DC2.ZUW', TRUE),
    ('33333333-3333-4333-8333-333333333333', 'marcochen', 'marco@example.com', 'Marco Chen', '$2y$10$Ow83t9rOLRd0nz2XivHVvumypkA6dE45gbMi/vJdMPG5V6DC2.ZUW', TRUE),
    ('44444444-4444-4444-8444-444444444444', 'ninapatel', 'nina@example.com', 'Nina Patel', '$2y$10$Ow83t9rOLRd0nz2XivHVvumypkA6dE45gbMi/vJdMPG5V6DC2.ZUW', FALSE)
ON DUPLICATE KEY UPDATE username = VALUES(username), name = VALUES(name), password_hash = VALUES(password_hash), location_sharing_enabled = VALUES(location_sharing_enabled);

INSERT INTO friend_requests (id, sender_id, receiver_id, status, responded_at) VALUES
    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'accepted', CURRENT_TIMESTAMP),
    ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'accepted', CURRENT_TIMESTAMP)
ON DUPLICATE KEY UPDATE status = VALUES(status), responded_at = VALUES(responded_at);

INSERT INTO circles (id, owner_id, name) VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'London friends')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO circle_members (circle_id, user_id, role, status) VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner', 'active'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member', 'active'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'member', 'active'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'member', 'paused')
ON DUPLICATE KEY UPDATE role = VALUES(role), status = VALUES(status);

INSERT INTO sharing_permissions (user_id, circle_id, is_enabled, consented_at) VALUES
    ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', TRUE, CURRENT_TIMESTAMP),
    ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', TRUE, CURRENT_TIMESTAMP),
    ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', TRUE, CURRENT_TIMESTAMP),
    ('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', FALSE, CURRENT_TIMESTAMP)
ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled), consented_at = VALUES(consented_at);

INSERT INTO locations (user_id, latitude, longitude, updated_at) VALUES
    ('11111111-1111-4111-8111-111111111111', 51.5074000, -0.1278000, CURRENT_TIMESTAMP),
    ('22222222-2222-4222-8222-222222222222', 51.5140000, -0.1030000, CURRENT_TIMESTAMP - INTERVAL 2 MINUTE),
    ('33333333-3333-4333-8333-333333333333', 51.4990000, -0.1410000, CURRENT_TIMESTAMP - INTERVAL 8 MINUTE),
    ('44444444-4444-4444-8444-444444444444', 51.5220000, -0.1550000, CURRENT_TIMESTAMP - INTERVAL 14 MINUTE)
ON DUPLICATE KEY UPDATE latitude = VALUES(latitude), longitude = VALUES(longitude), updated_at = VALUES(updated_at);

INSERT INTO invitations (id, circle_id, inviter_id, invitee_email, invitee_id, token_hash, status, expires_at) VALUES
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'jordan@example.com', NULL, SHA2('pingme-demo-jordan-invite', 256), 'pending', CURRENT_TIMESTAMP + INTERVAL 7 DAY)
ON DUPLICATE KEY UPDATE status = VALUES(status), expires_at = VALUES(expires_at);

INSERT INTO notifications (id, user_id, type, title, message, data_json) VALUES
    (1001, '11111111-1111-4111-8111-111111111111', 'location_update', 'Sana is nearby', 'Sana updated their location in Shoreditch.', JSON_OBJECT('userId', '22222222-2222-4222-8222-222222222222')),
    (1002, '11111111-1111-4111-8111-111111111111', 'invitation_sent', 'Invitation sent', 'Your invitation to jordan@example.com is waiting for a response.', JSON_OBJECT('invitationId', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'))
ON DUPLICATE KEY UPDATE message = VALUES(message), data_json = VALUES(data_json);

INSERT INTO location_history (id, user_id, latitude, longitude, recorded_at) VALUES
    (2001, '11111111-1111-4111-8111-111111111111', 51.5074000, -0.1278000, CURRENT_TIMESTAMP - INTERVAL 30 MINUTE),
    (2002, '11111111-1111-4111-8111-111111111111', 51.5077000, -0.1272000, CURRENT_TIMESTAMP - INTERVAL 15 MINUTE),
    (2003, '11111111-1111-4111-8111-111111111111', 51.5074000, -0.1278000, CURRENT_TIMESTAMP),
    (2004, '22222222-2222-4222-8222-222222222222', 51.5129000, -0.1041000, CURRENT_TIMESTAMP - INTERVAL 4 MINUTE),
    (2005, '22222222-2222-4222-8222-222222222222', 51.5140000, -0.1030000, CURRENT_TIMESTAMP - INTERVAL 2 MINUTE)
ON DUPLICATE KEY UPDATE latitude = VALUES(latitude), longitude = VALUES(longitude), recorded_at = VALUES(recorded_at);
