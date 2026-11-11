-- Self-service email change, verified by an OTP emailed to the NEW address.
ALTER TABLE auth_challenges
  MODIFY purpose ENUM('LOGIN_OTP','NEW_DEVICE','MOBILE_CHANGE','EMAIL_CHANGE') NOT NULL,
  ADD COLUMN target VARCHAR(190) NULL AFTER device_hash,
  ADD COLUMN otp_hash CHAR(64) NULL AFTER target,
  ADD COLUMN attempts INT NOT NULL DEFAULT 0 AFTER otp_hash;
