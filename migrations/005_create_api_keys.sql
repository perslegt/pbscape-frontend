CREATE TABLE api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 50),
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_used_at TEXT NULL,
  revoked_at TEXT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_api_keys_user_id ON api_keys (user_id);
CREATE UNIQUE INDEX idx_api_keys_key_hash ON api_keys (key_hash);
CREATE INDEX idx_api_keys_revoked_at ON api_keys (revoked_at);

CREATE TRIGGER enforce_active_api_key_limit
BEFORE INSERT ON api_keys
WHEN (SELECT COUNT(*) FROM api_keys WHERE user_id = NEW.user_id AND revoked_at IS NULL) >= 5
BEGIN
  SELECT RAISE(ABORT, 'active_api_key_limit');
END;
