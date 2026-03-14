-- Anomaly detection tables

CREATE TABLE IF NOT EXISTS anomalies (
  id BIGSERIAL PRIMARY KEY,
  precinct_id TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL,
  hour INTEGER NOT NULL,
  actual_count INTEGER NOT NULL,
  expected_count REAL NOT NULL,
  z_score REAL NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
  severity TEXT NOT NULL CHECK (severity IN ('moderate', 'significant', 'extreme')),
  explanation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anomalies_precinct ON anomalies (precinct_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomalies_time ON anomalies (detected_at DESC);

-- Alert subscriptions
CREATE TABLE IF NOT EXISTS alert_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  precinct_filter TEXT, -- null = all precincts
  min_severity TEXT NOT NULL DEFAULT 'significant' CHECK (min_severity IN ('moderate', 'significant', 'extreme')),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email, precinct_filter)
);

CREATE INDEX IF NOT EXISTS idx_alert_subs_email ON alert_subscriptions (email);
