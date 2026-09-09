-- Adds real user accounts (signup / login / forgot-password) and per-user
-- storage for the Interior quotation tool.
--
-- Additive only — creates new tables, never touches `properties`.
--
--   mysql -h <host> -u <user> -p <db> < migrate_add_auth_and_interior.sql

-- ---------------------------------------------------------------------------
-- users — one row per registered account.
-- email is VARCHAR(190) so it fits inside a utf8mb4 UNIQUE index (767-byte
-- limit on older MySQL/MariaDB: 190 * 4 = 760).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(36)  NOT NULL,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- user_sessions — opaque bearer tokens. Only the SHA-256 hash of the token is
-- stored, so a database leak can't be replayed as a valid login.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash CHAR(64)    NOT NULL,
  user_id    VARCHAR(36) NOT NULL,
  created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME    NOT NULL,
  PRIMARY KEY (token_hash),
  KEY idx_sessions_user (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- password_resets — single-use, time-limited reset tokens (hash stored, same
-- reasoning as sessions). used_at is set the moment a token is redeemed.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash CHAR(64)    NOT NULL,
  user_id    VARCHAR(36) NOT NULL,
  created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME    NOT NULL,
  used_at    DATETIME    NULL,
  PRIMARY KEY (token_hash),
  KEY idx_resets_user (user_id),
  CONSTRAINT fk_resets_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- interior_app_state — the Interior tool's data, one JSON blob per top-level
-- key (projects, prices, templates, ...) PER USER. Composite primary key means
-- each account gets a completely isolated workspace.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS interior_app_state (
  user_id    VARCHAR(36) NOT NULL,
  data_key   VARCHAR(64) NOT NULL,
  data_json  LONGTEXT    NOT NULL,
  updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
             ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, data_key),
  CONSTRAINT fk_interior_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
