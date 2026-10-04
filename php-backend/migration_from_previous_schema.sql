USE pingme;

-- Run this only if schema.sql was imported before the username/friend-request update.
ALTER TABLE users
    ADD COLUMN username VARCHAR(40) NULL AFTER id,
    ADD COLUMN location_sharing_enabled BOOLEAN NOT NULL DEFAULT TRUE AFTER password_hash;

UPDATE users
SET username = LOWER(SUBSTRING_INDEX(email, '@', 1))
WHERE username IS NULL OR username = '';

ALTER TABLE users
    MODIFY COLUMN username VARCHAR(40) NOT NULL,
    ADD UNIQUE KEY uq_users_username (username);

CREATE TABLE IF NOT EXISTS friend_requests (
    id CHAR(36) NOT NULL PRIMARY KEY,
    sender_id CHAR(36) NOT NULL,
    receiver_id CHAR(36) NOT NULL,
    status ENUM('pending', 'accepted', 'declined', 'cancelled') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP NULL,
    CONSTRAINT fk_friend_requests_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_friend_requests_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_friend_request_users CHECK (sender_id <> receiver_id),
    INDEX idx_friend_requests_receiver (receiver_id, status),
    INDEX idx_friend_requests_sender (sender_id, status)
) ENGINE=InnoDB;
