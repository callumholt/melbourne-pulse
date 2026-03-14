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

export type { ComPedestrianRecord, ComSensorLocation, ComMicroclimateRecord };
