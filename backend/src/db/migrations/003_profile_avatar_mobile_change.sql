-- Profile picture, stored as a small data URL (the client resizes to <=256px before upload).
-- Kept in the DB so it survives redeploys on hosts with an ephemeral disk.
ALTER TABLE users ADD COLUMN avatar MEDIUMTEXT NULL AFTER mobile;

-- Self-service mobile number change, verified by an OTP sent to the NEW number.
ALTER TABLE auth_challenges MODIFY purpose ENUM('LOGIN_OTP','NEW_DEVICE','MOBILE_CHANGE') NOT NULL;
