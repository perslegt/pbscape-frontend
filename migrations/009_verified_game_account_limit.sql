DROP TRIGGER enforce_game_account_limit;

CREATE TRIGGER enforce_game_account_limit
BEFORE INSERT ON game_accounts
WHEN NEW.verified_at IS NOT NULL
  AND (
    SELECT COUNT(*)
    FROM game_accounts
    WHERE user_id = NEW.user_id AND verified_at IS NOT NULL
  ) >= 10
BEGIN
  SELECT RAISE(ABORT, 'game_account_limit');
END;
