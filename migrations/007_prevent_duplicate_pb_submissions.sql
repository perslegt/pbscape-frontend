CREATE TRIGGER prevent_duplicate_pb_submission
BEFORE INSERT ON pb_submissions
WHEN EXISTS (
  SELECT 1
  FROM pb_submissions existing
  WHERE existing.game_account_id = NEW.game_account_id
    AND existing.boss_id = NEW.boss_id
    AND existing.duration_ms = NEW.duration_ms
    AND existing.accepted = 1
    AND NEW.accepted = 1
)
BEGIN
  SELECT RAISE(IGNORE);
END;
