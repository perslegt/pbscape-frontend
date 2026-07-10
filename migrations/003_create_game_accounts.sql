CREATE TABLE game_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  rsn TEXT NOT NULL,
  normalized_rsn TEXT NOT NULL UNIQUE,
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (verification_status IN ('UNVERIFIED', 'VERIFIED', 'REVOKED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_game_accounts_user_id ON game_accounts (user_id);
CREATE UNIQUE INDEX idx_game_accounts_normalized_rsn
  ON game_accounts (normalized_rsn);

CREATE TRIGGER enforce_game_account_limit
BEFORE INSERT ON game_accounts
WHEN (SELECT COUNT(*) FROM game_accounts WHERE user_id = NEW.user_id) >= 10
BEGIN
  SELECT RAISE(ABORT, 'game_account_limit');
END;
