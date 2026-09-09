-- Adds the required 10-digit mobile number captured at signup.
--
-- DEFAULT '' keeps the ALTER safe on a table that already has rows; new
-- accounts always supply a real value (validated in auth_signup.php and
-- authRoutes.js before the INSERT).

ALTER TABLE users
  ADD COLUMN mobile VARCHAR(10) NOT NULL DEFAULT '' AFTER email;
