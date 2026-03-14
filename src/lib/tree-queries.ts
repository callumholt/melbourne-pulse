import { getDb } from "./db";

export interface PrecinctTreeStats {
  precinct_id: string;
  tree_count: number;
  species_count: number;
  avg_lifespan: number;
  health_score: number; // 0-100, based on useful_life_value distribution
  top_species: string[];
}

export interface TreePoint {
  com_id: string;
  lat: number;
  lon: number;
  common_name: string;
  scientific_name: string;
  age_description: string;
  useful_life_value: number | null;
  precinct_id: string | null;
}

/**
 * Get tree stats per precinct for the dashboard cards.
 */
export async function getPrecinctTreeStats(): Promise<PrecinctTreeStats[]> {
  const sql = getDb();

  const rows = await sql`
    SELECT
      precinct_id,
      COUNT(*)::INTEGER AS tree_count,
      COUNT(DISTINCT genus)::INTEGER AS species_count,
      AVG(useful_life_value)::REAL AS avg_lifespan,
      -- Health score: % of trees with useful_life_value > 10
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE useful_life_value > 10) / NULLIF(COUNT(*), 0)
      )::INTEGER AS health_score
    FROM trees
    WHERE precinct_id IS NOT NULL
    GROUP BY precinct_id
    ORDER BY precinct_id
  `;

  const result: PrecinctTreeStats[] = [];

  for (const row of rows) {
    // Get top 3 species for this precinct
    const speciesRows = await sql`
      SELECT common_name, COUNT(*)::INTEGER AS cnt
      FROM trees
      WHERE precinct_id = ${row.precinct_id}
      GROUP BY common_name
      ORDER BY cnt DESC
      LIMIT 3
    `;

    result.push({
      precinct_id: String(row.precinct_id),
      tree_count: Number(row.tree_count),
      species_count: Number(row.species_count),
      avg_lifespan: Number(row.avg_lifespan) || 0,
      health_score: Number(row.health_score) || 0,
      top_species: speciesRows.map((s) => String(s.common_name)),
    });
  }

  return result;
}

/**
 * Get tree points for the map layer.
 * Returns a sample for performance (max 5000 trees in view).
 */
export async function getTreesForMap(precinctId?: string): Promise<TreePoint[]> {
  const sql = getDb();

  const rows = precinctId
    ? await sql`
        SELECT com_id, lat, lon, common_name, scientific_name, age_description, useful_life_value, precinct_id
        FROM trees
        WHERE precinct_id = ${precinctId}
        LIMIT 5000
      `
    : await sql`
        SELECT com_id, lat, lon, common_name, scientific_name, age_description, useful_life_value, precinct_id
        FROM trees
        WHERE precinct_id IS NOT NULL
        ORDER BY RANDOM()
        LIMIT 5000
      `;

  return rows.map((r) => ({
    com_id: String(r.com_id),
    lat: Number(r.lat),
    lon: Number(r.lon),
    common_name: String(r.common_name),
    scientific_name: String(r.scientific_name),
    age_description: String(r.age_description),
    useful_life_value: r.useful_life_value != null ? Number(r.useful_life_value) : null,
    precinct_id: r.precinct_id ? String(r.precinct_id) : null,
  }));
}
