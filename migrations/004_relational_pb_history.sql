ALTER TABLE pb_submissions RENAME TO legacy_pb_submissions;
ALTER TABLE personal_bests RENAME TO legacy_personal_bests;

CREATE TABLE pb_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_account_id INTEGER NOT NULL,
  boss_id INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms > 0 AND duration_ms <= 86400000),
  source TEXT NOT NULL CHECK (source IN ('RUNELITE', 'MANUAL', 'IMPORT', 'ADMIN')),
  screenshot_url TEXT NULL,
  accepted INTEGER NOT NULL DEFAULT 1 CHECK (accepted IN (0, 1)),
  rejection_reason TEXT NULL,
  became_personal_best INTEGER NOT NULL DEFAULT 0 CHECK (became_personal_best IN (0, 1)),
  submitted_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (game_account_id) REFERENCES game_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (boss_id) REFERENCES bosses(id)
);

CREATE TABLE personal_bests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_account_id INTEGER NOT NULL,
  boss_id INTEGER NOT NULL,
  best_duration_ms INTEGER NOT NULL CHECK (best_duration_ms > 0 AND best_duration_ms <= 86400000),
  submission_id INTEGER NOT NULL UNIQUE,
  achieved_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (game_account_id) REFERENCES game_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (boss_id) REFERENCES bosses(id),
  FOREIGN KEY (submission_id) REFERENCES pb_submissions(id) ON DELETE CASCADE,
  UNIQUE (game_account_id, boss_id)
);

CREATE INDEX idx_pb_submissions_game_account
  ON pb_submissions (game_account_id);
CREATE INDEX idx_pb_submissions_boss
  ON pb_submissions (boss_id);
CREATE INDEX idx_pb_submissions_submitted
  ON pb_submissions (submitted_at DESC);
CREATE INDEX idx_pb_submissions_account_boss_submitted
  ON pb_submissions (game_account_id, boss_id, submitted_at DESC);
CREATE INDEX idx_personal_bests_boss_duration
  ON personal_bests (boss_id, best_duration_ms ASC);
CREATE INDEX idx_personal_bests_game_account
  ON personal_bests (game_account_id);

INSERT INTO pb_submissions (
  game_account_id,
  boss_id,
  duration_ms,
  source,
  screenshot_url,
  accepted,
  rejection_reason,
  submitted_at,
  created_at
)
SELECT
  ga.id,
  legacy.boss_id,
  legacy.time_millis,
  CASE WHEN lower(legacy.source) = 'plugin' THEN 'RUNELITE' ELSE 'IMPORT' END,
  legacy.screenshot_url,
  1,
  NULL,
  legacy.submitted_at,
  legacy.submitted_at
FROM legacy_pb_submissions legacy
JOIN game_accounts ga
  ON lower(trim(legacy.player_name)) = ga.normalized_rsn
WHERE legacy.time_millis > 0
  AND legacy.time_millis <= 86400000;

INSERT INTO pb_submissions (
  game_account_id,
  boss_id,
  duration_ms,
  source,
  accepted,
  submitted_at,
  created_at
)
SELECT
  ga.id,
  legacy.boss_id,
  legacy.time_millis,
  'IMPORT',
  1,
  legacy.submitted_at,
  legacy.submitted_at
FROM legacy_personal_bests legacy
JOIN game_accounts ga
  ON lower(trim(legacy.player_name)) = ga.normalized_rsn
WHERE legacy.time_millis > 0
  AND legacy.time_millis <= 86400000
  AND NOT EXISTS (
    SELECT 1
    FROM pb_submissions submission
    WHERE submission.game_account_id = ga.id
      AND submission.boss_id = legacy.boss_id
      AND submission.duration_ms = legacy.time_millis
  );

INSERT INTO personal_bests (
  game_account_id,
  boss_id,
  best_duration_ms,
  submission_id,
  achieved_at,
  created_at,
  updated_at
)
SELECT
  ga.id,
  legacy.boss_id,
  legacy.time_millis,
  (
    SELECT submission.id
    FROM pb_submissions submission
    WHERE submission.game_account_id = ga.id
      AND submission.boss_id = legacy.boss_id
      AND submission.duration_ms = legacy.time_millis
    ORDER BY submission.submitted_at ASC, submission.id ASC
    LIMIT 1
  ),
  legacy.submitted_at,
  legacy.submitted_at,
  legacy.updated_at
FROM legacy_personal_bests legacy
JOIN game_accounts ga
  ON lower(trim(legacy.player_name)) = ga.normalized_rsn
WHERE legacy.time_millis > 0
  AND legacy.time_millis <= 86400000;

UPDATE pb_submissions
SET became_personal_best = 1
WHERE id IN (SELECT submission_id FROM personal_bests);
