ALTER TABLE api_keys RENAME TO legacy_user_api_keys;

CREATE TABLE api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_account_id INTEGER NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_used_at TEXT NULL,
  revoked_at TEXT NULL,
  FOREIGN KEY (game_account_id) REFERENCES game_accounts(id) ON DELETE CASCADE
);

CREATE INDEX idx_account_api_keys_game_account
  ON api_keys (game_account_id);
CREATE UNIQUE INDEX idx_account_api_keys_hash
  ON api_keys (key_hash);
CREATE INDEX idx_account_api_keys_revoked
  ON api_keys (revoked_at);
CREATE UNIQUE INDEX idx_account_api_keys_one_active
  ON api_keys (game_account_id)
  WHERE revoked_at IS NULL;

INSERT INTO api_keys (
  id,
  game_account_id,
  key_prefix,
  key_hash,
  created_at,
  last_used_at,
  revoked_at
)
SELECT
  legacy.id,
  account.id,
  legacy.key_prefix,
  legacy.key_hash,
  legacy.created_at,
  legacy.last_used_at,
  legacy.revoked_at
FROM legacy_user_api_keys legacy
JOIN game_accounts account ON account.user_id = legacy.user_id
WHERE (
  SELECT COUNT(*)
  FROM game_accounts owned
  WHERE owned.user_id = legacy.user_id
) = 1;
