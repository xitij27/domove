-- Obstacle detection runs every 5 minutes instead of every 15, so a new or
-- changed route shows its sites sooner. Paste after
-- 20261017120000_site_ratings.sql.
--
-- :01, :06, ..., :56 keeps the 5-minute gap and stays clear of the hourly
-- site sync at :00, which finishes within seconds. A pass takes about a
-- second; only new or changed routes call the router. Scheduling an existing
-- name replaces it.
select cron.schedule('detect-obstacles', '1-59/5 * * * *', 'select private.detect_obstacles()');
