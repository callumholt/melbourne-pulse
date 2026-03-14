-- Vessel position history for AIS trail replay
CREATE TABLE IF NOT EXISTS vessel_positions (
  id BIGSERIAL PRIMARY KEY,
  mmsi TEXT NOT NULL,
  vessel_name TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  course REAL,
  speed REAL,
  heading REAL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vessel_pos_mmsi_time ON vessel_positions (mmsi, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_vessel_pos_time ON vessel_positions (received_at DESC);
