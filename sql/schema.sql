-- Melbourne Pulse Database Schema
-- Run this in the Supabase SQL Editor

-- 1. Precincts table
CREATE TABLE IF NOT EXISTS precincts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  colour TEXT NOT NULL DEFAULT '#6b7280',
  display_order INTEGER NOT NULL DEFAULT 0
);

-- 2. Sensors table
CREATE TABLE IF NOT EXISTS sensors (
  sensor_id INTEGER PRIMARY KEY,
  sensor_name TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  status TEXT DEFAULT 'A',
  precinct_id TEXT REFERENCES precincts(id)
);

CREATE INDEX IF NOT EXISTS idx_sensors_precinct ON sensors(precinct_id);

-- 3. Pedestrian counts (time-series core)
CREATE TABLE IF NOT EXISTS pedestrian_counts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sensor_id INTEGER NOT NULL REFERENCES sensors(sensor_id),
  counted_at TIMESTAMPTZ NOT NULL,
  hour_of_day INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(sensor_id, counted_at)
);

CREATE INDEX IF NOT EXISTS idx_ped_counted_at ON pedestrian_counts(counted_at DESC);
CREATE INDEX IF NOT EXISTS idx_ped_sensor_time ON pedestrian_counts(sensor_id, counted_at DESC);
CREATE INDEX IF NOT EXISTS idx_ped_hour_dow ON pedestrian_counts(hour_of_day, day_of_week);

-- 4. Microclimate readings
CREATE TABLE IF NOT EXISTS microclimate_readings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site_id TEXT NOT NULL,
  site_description TEXT,
  type TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  units TEXT,
  UNIQUE(site_id, recorded_at, type)
);

CREATE INDEX IF NOT EXISTS idx_micro_recorded ON microclimate_readings(recorded_at DESC);

-- 5. Ingestion log
CREATE TABLE IF NOT EXISTS ingestion_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dataset TEXT NOT NULL,
  records_fetched INTEGER NOT NULL DEFAULT 0,
  records_inserted INTEGER NOT NULL DEFAULT 0,
  records_skipped INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Views

-- Current activity per precinct (latest available hour, falls back if current hour empty)
CREATE OR REPLACE VIEW precinct_current_activity AS
WITH latest_hour AS (
  SELECT MAX(counted_at) AS max_time FROM pedestrian_counts
),
target_hour AS (
  SELECT
    CASE
      WHEN EXISTS (
        SELECT 1 FROM pedestrian_counts
        WHERE counted_at >= DATE_TRUNC('hour', NOW() AT TIME ZONE 'Australia/Melbourne') - INTERVAL '1 hour'
          AND counted_at < DATE_TRUNC('hour', NOW() AT TIME ZONE 'Australia/Melbourne')
      )
      THEN DATE_TRUNC('hour', NOW() AT TIME ZONE 'Australia/Melbourne') - INTERVAL '1 hour'
      ELSE DATE_TRUNC('hour', (SELECT max_time FROM latest_hour))
    END AS hour_start
)
SELECT
  s.precinct_id,
  p.name AS precinct_name,
  p.colour,
  COALESCE(SUM(pc.count), 0)::BIGINT AS total_count,
  COUNT(DISTINCT s.sensor_id)::BIGINT AS sensor_count
FROM sensors s
JOIN precincts p ON p.id = s.precinct_id
LEFT JOIN pedestrian_counts pc ON pc.sensor_id = s.sensor_id
  AND pc.counted_at >= (SELECT hour_start FROM target_hour)
  AND pc.counted_at < (SELECT hour_start FROM target_hour) + INTERVAL '1 hour'
WHERE s.status = 'A'
GROUP BY s.precinct_id, p.name, p.colour, p.display_order
ORDER BY p.display_order;

-- Hourly averages per precinct per day-of-week (last 90 days)
CREATE OR REPLACE VIEW precinct_hourly_averages AS
SELECT
  s.precinct_id,
  pc.hour_of_day,
  pc.day_of_week,
  AVG(pc.count)::DOUBLE PRECISION AS avg_count
FROM pedestrian_counts pc
JOIN sensors s ON s.sensor_id = pc.sensor_id
WHERE pc.counted_at >= NOW() - INTERVAL '90 days'
GROUP BY s.precinct_id, pc.hour_of_day, pc.day_of_week;

-- 7. RPC Functions

-- Get latest date with data
CREATE OR REPLACE FUNCTION get_latest_data_date()
RETURNS DATE
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(MAX(counted_at)::DATE, CURRENT_DATE) FROM pedestrian_counts;
$$;

-- Get hourly totals per precinct for a given date
CREATE OR REPLACE FUNCTION get_precinct_today_hourly(target_date DATE)
RETURNS TABLE(precinct_id TEXT, hour_of_day INTEGER, total_count BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT
    s.precinct_id,
    pc.hour_of_day,
    SUM(pc.count)::BIGINT AS total_count
  FROM pedestrian_counts pc
  JOIN sensors s ON s.sensor_id = pc.sensor_id
  WHERE pc.counted_at::DATE = target_date
  GROUP BY s.precinct_id, pc.hour_of_day
  ORDER BY s.precinct_id, pc.hour_of_day;
$$;

-- Get city-wide pulse summary (falls back to latest available hour)
CREATE OR REPLACE FUNCTION get_city_pulse()
RETURNS TABLE(total_current BIGINT, sensor_count BIGINT, historical_avg DOUBLE PRECISION)
LANGUAGE sql STABLE
AS $$
  WITH latest_hour AS (
    SELECT MAX(counted_at) AS max_time FROM pedestrian_counts
  ),
  target_hour AS (
    SELECT
      CASE
        WHEN EXISTS (
          SELECT 1 FROM pedestrian_counts
          WHERE counted_at >= DATE_TRUNC('hour', NOW() AT TIME ZONE 'Australia/Melbourne') - INTERVAL '1 hour'
            AND counted_at < DATE_TRUNC('hour', NOW() AT TIME ZONE 'Australia/Melbourne')
        )
        THEN DATE_TRUNC('hour', NOW() AT TIME ZONE 'Australia/Melbourne') - INTERVAL '1 hour'
        ELSE DATE_TRUNC('hour', (SELECT max_time FROM latest_hour))
      END AS hour_start
  ),
  current_data AS (
    SELECT
      COALESCE(SUM(pc.count), 0)::BIGINT AS total,
      COUNT(DISTINCT pc.sensor_id)::BIGINT AS sensors
    FROM pedestrian_counts pc
    WHERE pc.counted_at >= (SELECT hour_start FROM target_hour)
      AND pc.counted_at < (SELECT hour_start FROM target_hour) + INTERVAL '1 hour'
  ),
  target_meta AS (
    SELECT
      EXTRACT(HOUR FROM (SELECT hour_start FROM target_hour) AT TIME ZONE 'Australia/Melbourne')::INTEGER AS target_hod,
      EXTRACT(DOW FROM (SELECT hour_start FROM target_hour) AT TIME ZONE 'Australia/Melbourne')::INTEGER AS target_dow
  ),
  historical AS (
    SELECT
      COALESCE(AVG(daily_total), 0)::DOUBLE PRECISION AS avg_total
    FROM (
      SELECT SUM(pc.count) AS daily_total
      FROM pedestrian_counts pc
      WHERE pc.hour_of_day = (SELECT target_hod FROM target_meta)
        AND pc.day_of_week = (SELECT target_dow FROM target_meta)
        AND pc.counted_at >= NOW() - INTERVAL '90 days'
        AND pc.counted_at < (SELECT hour_start FROM target_hour)
      GROUP BY pc.counted_at::DATE
    ) daily
  )
  SELECT
    cd.total AS total_current,
    cd.sensors AS sensor_count,
    h.avg_total AS historical_avg
  FROM current_data cd, historical h;
$$;

-- 8. Row Level Security

ALTER TABLE precincts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensors ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedestrian_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE microclimate_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_log ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read precincts" ON precincts FOR SELECT USING (true);
CREATE POLICY "Public read sensors" ON sensors FOR SELECT USING (true);
CREATE POLICY "Public read pedestrian_counts" ON pedestrian_counts FOR SELECT USING (true);
CREATE POLICY "Public read microclimate_readings" ON microclimate_readings FOR SELECT USING (true);
CREATE POLICY "Public read ingestion_log" ON ingestion_log FOR SELECT USING (true);

-- Service role insert/update (handled automatically by service role key bypassing RLS)
