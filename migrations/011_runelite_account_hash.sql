ALTER TABLE game_accounts ADD COLUMN runelite_account_hash TEXT NULL;

CREATE UNIQUE INDEX idx_game_accounts_runelite_hash
  ON game_accounts (runelite_account_hash)
  WHERE runelite_account_hash IS NOT NULL;

CREATE TABLE game_account_name_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_account_id INTEGER NOT NULL,
  previous_rsn TEXT NOT NULL,
  previous_normalized_rsn TEXT NOT NULL,
  changed_to_rsn TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('RUNELITE_ACCOUNT_HASH_MATCH')),
  FOREIGN KEY (game_account_id) REFERENCES game_accounts(id) ON DELETE CASCADE
);

CREATE INDEX idx_game_account_name_history_account
  ON game_account_name_history (game_account_id, changed_at DESC);
