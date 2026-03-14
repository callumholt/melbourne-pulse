-- Urban Forest tree data
CREATE TABLE IF NOT EXISTS trees (
  com_id TEXT PRIMARY KEY,
  common_name TEXT NOT NULL,
  scientific_name TEXT,
  genus TEXT,
  family TEXT,
  diameter_breast_height REAL,
  year_planted TEXT,
  age_description TEXT,
  useful_life TEXT,
  useful_life_value INTEGER,
  precinct TEXT,
  precinct_id TEXT REFERENCES precincts(id),
  located_in TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trees_precinct ON trees(precinct_id);
CREATE INDEX IF NOT EXISTS idx_trees_health ON trees(useful_life_value);
CREATE INDEX IF NOT EXISTS idx_trees_location ON trees(lat, lon);
