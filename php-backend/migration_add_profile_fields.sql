USE pingme;

ALTER TABLE users
    ADD COLUMN avatar_id VARCHAR(20) NOT NULL DEFAULT 'avatar_01' AFTER name;

UPDATE users
SET avatar_id = 'avatar_01'
WHERE avatar_id IS NULL OR avatar_id = '';
