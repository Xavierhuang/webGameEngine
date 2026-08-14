-- Password reset.
--
-- /auth/forgot-password has shipped since the start as a TODO that told the
-- user "Password reset isn't wired up yet" — there was no endpoint and no
-- storage. Same single-use-hashed-token design as parental_consents.

USE gameengine;

CREATE TABLE IF NOT EXISTS password_resets (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  -- SHA-256 of the token, never the token itself: a database leak must not
  -- hand out working password-reset links.
  token_hash CHAR(64) NOT NULL UNIQUE,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_password_resets_user (user_id)
);
