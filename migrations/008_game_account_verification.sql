ALTER TABLE game_accounts ADD COLUMN verified_at TEXT NULL;

CREATE TABLE game_account_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  rsn TEXT NOT NULL,
  normalized_rsn TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT NULL,
  cancelled_at TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_game_account_verifications_user
  ON game_account_verifications (user_id, created_at DESC);
CREATE INDEX idx_game_account_verifications_code_hash
  ON game_account_verifications (code_hash);
CREATE INDEX idx_game_account_verifications_rsn
  ON game_account_verifications (normalized_rsn);
CREATE UNIQUE INDEX idx_game_account_verifications_one_active
  ON game_account_verifications (user_id, normalized_rsn)
  WHERE used_at IS NULL AND cancelled_at IS NULL;

CREATE TABLE verification_rate_limits (
  rate_key TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL
);
