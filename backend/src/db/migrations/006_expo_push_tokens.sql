-- Native push for the RMW CRM mobile app (Expo push service). One row per installed app/device.
CREATE TABLE IF NOT EXISTS expo_push_tokens (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  token VARCHAR(255) NOT NULL,
  platform VARCHAR(20) NULL,
  device_name VARCHAR(150) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_used_at DATETIME(3) NULL,
  UNIQUE KEY uq_expo_token (token),
  KEY idx_expo_user (user_id),
  CONSTRAINT fk_expo_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
