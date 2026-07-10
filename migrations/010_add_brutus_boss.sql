INSERT INTO bosses (slug, name, is_active)
VALUES ('brutus', 'Brutus', 1)
ON CONFLICT(slug) DO UPDATE SET
  name = excluded.name,
  is_active = 1;
