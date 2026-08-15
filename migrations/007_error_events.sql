-- Error capture.
--
-- The audit flagged "no Sentry, no OpenTelemetry, no metrics" and it stayed
-- true. Failures were only visible by SSHing in and reading journalctl, which
-- means nobody notices until someone complains.
--
-- Self-hosted rather than a vendor: no account, no DSN, no third party
-- receiving children's data. Deliberately small — a ring buffer of recent
-- errors, not a full APM.

USE gameengine;

CREATE TABLE IF NOT EXISTS error_events (
  id CHAR(36) PRIMARY KEY,
  -- 'server' for API/render failures, 'client' for browser exceptions.
  source ENUM('server', 'client') NOT NULL,
  message TEXT NOT NULL,
  -- Truncated before storage; a full stack per row would dwarf the message.
  stack TEXT,
  url VARCHAR(500),
  -- Null for signed-out visitors; this is diagnostics, not tracking.
  profile_id CHAR(36) NULL,
  user_agent VARCHAR(300),
  -- Identical errors collapse onto one row with a count, so one broken page
  -- viewed a thousand times doesn't bury everything else.
  fingerprint CHAR(64) NOT NULL,
  occurrences INT NOT NULL DEFAULT 1,
  first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY unique_fingerprint (fingerprint),
  INDEX idx_error_events_last_seen (last_seen),
  INDEX idx_error_events_resolved (resolved),
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL
);
