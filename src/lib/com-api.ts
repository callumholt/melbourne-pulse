const BASE_URL = process.env.COM_API_BASE || "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets";

// Types matching actual CoM API response fields
interface ComPedestrianRecord {
  id: number;
  location_id: number;
  sensing_date: string;
  hourday: number;
  direction_1: number;
  direction_2: number;
  pedestriancount: number;
  sensor_name: string;
  location: { lat: number; lon: number };
}

interface ComSensorLocation {
  location_id: number;
  sensor_description: string;
  sensor_name: string;
  installation_date: string;
  status: string;
  latitude: number;
  longitude: number;
  location: { lat: number; lon: number };
}

interface ComMicroclimateRecord {
  site_id: string;
  site_description: string;
  type: string;
  local_time: string;
  value: number;
  units: string;
}

interface ComApiResponse<T> {
  total_count: number;
  results: T[];
}

async function fetchPaginated<T>(dataset: string, params: Record<string, string> = {}, maxRecords = 300): Promise<T[]> {
  const results: T[] = [];
  let offset = 0;
  const limit = 100;

  while (offset < maxRecords) {
    const searchParams = new URLSearchParams({
      ...params,
      limit: String(limit),
      offset: String(offset),
    });

    const url = `${BASE_URL}/${dataset}/records?${searchParams}`;
    const res = await fetch(url, { next: { revalidate: 0 } });

    if (!res.ok) {
      throw new Error(`CoM API error: ${res.status} ${res.statusText} for ${dataset}`);
    }

    const data: ComApiResponse<T> = await res.json();
    results.push(...data.results);

    if (data.results.length < limit || results.length >= data.total_count) break;
    offset += limit;
  }

  return results;
}

export async function fetchPedestrianData(date: string): Promise<ComPedestrianRecord[]> {
  return fetchPaginated<ComPedestrianRecord>(
    "pedestrian-counting-system-monthly-counts-per-hour",
    { where: `sensing_date = date'${date}'`, order_by: "hourday ASC" },
    5000
  );
}

export async function fetchSensorLocations(): Promise<ComSensorLocation[]> {
  return fetchPaginated<ComSensorLocation>(
    "pedestrian-counting-system-sensor-locations",
    {},
    200
  );
}

export async function fetchMicroclimateData(): Promise<ComMicroclimateRecord[]> {
  return fetchPaginated<ComMicroclimateRecord>(
    "microclimate-sensor-readings",
    { order_by: "local_time DESC" },
    500
  );
}

// Urban Forest tree data
interface ComTreeRecord {
  com_id: string;
  common_name: string;
  scientific_name: string;
  genus: string;
  family: string;
  diameter_breast_height: number;
  year_planted: string;
  age_description: string;
  useful_life_expectency: string;
  useful_life_expectency_value: number;
  precinct: string;
  located_in: string;
  latitude: number;
  longitude: number;
}

export async function fetchTreeData(offset = 0, limit = 100): Promise<{ records: ComTreeRecord[]; total: number }> {
  const searchParams = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    select: "com_id,common_name,scientific_name,genus,family,diameter_breast_height,year_planted,age_description,useful_life_expectency,useful_life_expectency_value,precinct,located_in,latitude,longitude",
  });

  const url = `${BASE_URL}/trees-with-species-and-dimensions-urban-forest/records?${searchParams}`;
  const res = await fetch(url, { next: { revalidate: 0 } });

  if (!res.ok) {
    throw new Error(`CoM API error: ${res.status} for trees dataset`);
  }

  const data: ComApiResponse<ComTreeRecord> = await res.json();
  return { records: data.results, total: data.total_count };
}

export async function fetchAllTrees(maxRecords = 90000): Promise<ComTreeRecord[]> {
  return fetchPaginated<ComTreeRecord>(
    "trees-with-species-and-dimensions-urban-forest",
    {
      select: "com_id,common_name,scientific_name,genus,family,diameter_breast_height,year_planted,age_description,useful_life_expectency,useful_life_expectency_value,precinct,located_in,latitude,longitude",
    },
    maxRecords
  );
}

// On-street parking bay sensors (real-time occupancy)
interface ComParkingSensorRecord {
  bay_id: number;
  st_marker_id: string;
  status: string; // "Occupied" | "Unoccupied"
  lat: number;
  lon: number;
  location: { lat: number; lon: number } | null;
}

export async function fetchParkingSensors(): Promise<ComParkingSensorRecord[]> {
  return fetchPaginated<ComParkingSensorRecord>(
    "on-street-parking-bay-sensors",
    {
      select: "bay_id,st_marker_id,status,lat,lon,location",
    },
    5000
  );
}

// Cafes and restaurants with seating capacity
interface ComCafeRecord {
  census_year: number;
  trading_name: string;
  street_address: string;
  clue_small_area: string;
  industry_description: string;
  seating_type: string;
  number_of_seats: number;
  longitude: number;
  latitude: number;
}

export async function fetchCafesAndRestaurants(): Promise<ComCafeRecord[]> {
  return fetchPaginated<ComCafeRecord>(
    "cafes-and-restaurants-with-seating-capacity",
    {
      select: "census_year,trading_name,street_address,clue_small_area,industry_description,seating_type,number_of_seats,longitude,latitude",
      order_by: "census_year DESC",
    },
    5000
  );
}

// Bars and pubs with patron capacity
interface ComBarRecord {
  census_year: number;
  trading_name: string;
  street_address: string;
  clue_small_area: string;
  industry_description: string;
  number_of_patrons: number;
  longitude: number;
  latitude: number;
}

export async function fetchBarsAndPubs(): Promise<ComBarRecord[]> {
  return fetchPaginated<ComBarRecord>(
    "bars-and-pubs-with-patron-capacity",
    {
      select: "census_year,trading_name,street_address,clue_small_area,industry_description,number_of_patrons,longitude,latitude",
      order_by: "census_year DESC",
    },
    3000
  );
}

// Building footprints (2023) - uses GeoJSON export for polygons
export async function fetchBuildingFootprints(bbox?: { minLat: number; minLon: number; maxLat: number; maxLon: number }): Promise<GeoJSON.FeatureCollection> {
  const params = new URLSearchParams({ limit: "100" });

  if (bbox) {
    // Use within_distance or geo filter
    params.set("where", `within_distance(geo_shape, geom'POINT(${(bbox.minLon + bbox.maxLon) / 2} ${(bbox.minLat + bbox.maxLat) / 2})', 2km)`);
    params.set("limit", "5000");
  }

  const url = `${BASE_URL}/2023-building-footprints/exports/geojson?${params}`;
  const res = await fetch(url, { next: { revalidate: 86400 } }); // cache 24h

  if (!res.ok) {
    throw new Error(`CoM API error: ${res.status} for building footprints`);
  }

  return res.json();
}

export type { ComPedestrianRecord, ComSensorLocation, ComMicroclimateRecord, ComTreeRecord, ComParkingSensorRecord, ComCafeRecord, ComBarRecord };
