-- Which CRM look each user has installed (1 = classic, 2 = 2.0) and whether they finished the 2.0 tour. Follows the account across browsers.
ALTER TABLE users
  ADD COLUMN ui_version TINYINT UNSIGNED NOT NULL DEFAULT 1,
  ADD COLUMN ui_tour_done TINYINT(1) NOT NULL DEFAULT 0;
