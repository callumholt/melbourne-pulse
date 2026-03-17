/**
 * Pedestrian flow inference engine.
 *
 * Infers directional movement between sensors using a gravity model:
 * when sensor A's count drops and nearby sensor B's count rises, we
 * infer flow from A to B proportional to the magnitude and inversely
 * proportional to the squared distance between them.
 */

interface SensorPosition {
  sensor_id: number;
  lat: number;
  lon: number;
  precinct_id: string;
}

export interface FlowTrip {
  path: [number, number][];   // [lon, lat] waypoints along bezier curve
  timestamps: number[];       // time (hours) at each waypoint
  magnitude: number;          // normalised 0-1
  color: [number, number, number];
}

// Hourly index: sensorId -> Float64Array(24 hours)
type HourlyIndex = Map<number, Float64Array>;

// Haversine distance in metres
function distanceMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Generate a quadratic bezier curve between two points with a perpendicular offset.
 * Returns N waypoints along the curve.
 */
function bezierPath(
  from: [number, number],
  to: [number, number],
  numPoints: number,
  curvature: number = 0.3,
): [number, number][] {
  // Midpoint
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;

  // Perpendicular offset direction
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  // Rotate 90 degrees
  const px = -dy * curvature;
  const py = dx * curvature;

  // Control point
  const cx = mx + px;
  const cy = my + py;

  const points: [number, number][] = [];
  for (let i = 0; i < numPoints; i++) {
    const t = i / (numPoints - 1);
    const u = 1 - t;
    const x = u * u * from[0] + 2 * u * t * cx + t * t * to[0];
    const y = u * u * from[1] + 2 * u * t * cy + t * t * to[1];
    points.push([x, y]);
  }
  return points;
}

// Max distance (metres) to consider flow between sensors
const MAX_FLOW_DISTANCE = 2000;
// Minimum flow magnitude to generate a trip
const MIN_FLOW_THRESHOLD = 50;
// Max number of flow pairs per hour transition
const MAX_FLOWS_PER_HOUR = 80;
// Waypoints per flow path
const PATH_POINTS = 12;

/**
 * Resample an arbitrary-length coordinate path to exactly N evenly-spaced
 * points, measured by cumulative Euclidean arc length along the path.
 * This ensures the resulting array aligns with the timestamps array used in
 * FlowTrip.
 */
function resamplePath(coords: [number, number][], n: number): [number, number][] {
  if (coords.length === 0) return [];
  if (coords.length === 1) return Array(n).fill(coords[0]) as [number, number][];

  // Build cumulative arc-length table
  const lengths: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i][0] - coords[i - 1][0];
    const dy = coords[i][1] - coords[i - 1][1];
    lengths.push(lengths[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  const totalLength = lengths[lengths.length - 1];

  if (totalLength === 0) {
    return Array(n).fill(coords[0]) as [number, number][];
  }

  const result: [number, number][] = [];
  let segIdx = 0;

  for (let i = 0; i < n; i++) {
    const targetLen = (i / (n - 1)) * totalLength;

    // Advance segment index to the segment that contains targetLen
    while (segIdx < lengths.length - 2 && lengths[segIdx + 1] < targetLen) {
      segIdx++;
    }

    const segStart = lengths[segIdx];
    const segEnd = lengths[segIdx + 1];
    const segLen = segEnd - segStart;

    const t = segLen > 0 ? (targetLen - segStart) / segLen : 0;
    const p0 = coords[segIdx];
    const p1 = coords[segIdx + 1];
    result.push([
      p0[0] + t * (p1[0] - p0[0]),
      p0[1] + t * (p1[1] - p0[1]),
    ]);
  }

  return result;
}

/**
 * Pre-compute all flow trips for a full 24-hour period.
 *
 * For each hour transition, identifies sources (decreasing count) and
 * sinks (increasing count), then distributes flow using gravity model.
 */
export function computeFlowTrips(
  sensors: SensorPosition[],
  hourlyIndex: HourlyIndex,
  streetRoutes?: Map<string, [number, number][]>,
): FlowTrip[] {
  if (sensors.length === 0 || hourlyIndex.size === 0) return [];

  // Pre-compute pairwise distances (only for nearby sensors)
  const distCache = new Map<string, number>();
  const neighbours = new Map<number, { sensor: SensorPosition; dist: number }[]>();

  for (const a of sensors) {
    const nearby: { sensor: SensorPosition; dist: number }[] = [];
    for (const b of sensors) {
      if (a.sensor_id === b.sensor_id) continue;
      const d = distanceMetres(a.lat, a.lon, b.lat, b.lon);
      if (d <= MAX_FLOW_DISTANCE) {
        nearby.push({ sensor: b, dist: d });
        distCache.set(`${a.sensor_id}-${b.sensor_id}`, d);
      }
    }
    // Sort by distance for gravity weighting
    nearby.sort((a, b) => a.dist - b.dist);
    neighbours.set(a.sensor_id, nearby);
  }

  // Build sensor position lookup
  const posById = new Map<number, SensorPosition>();
  for (const s of sensors) posById.set(s.sensor_id, s);

  const allTrips: FlowTrip[] = [];
  let globalMaxFlow = 0;

  // For each hour transition
  for (let hour = 0; hour < 23; hour++) {
    const sources: { sensor: SensorPosition; outflow: number }[] = [];
    const sinks: { sensor: SensorPosition; inflow: number }[] = [];

    for (const s of sensors) {
      const hours = hourlyIndex.get(s.sensor_id);
      if (!hours) continue;
      const countNow = hours[hour];
      const countNext = hours[hour + 1];
      const delta = countNext - countNow;

      if (delta < -MIN_FLOW_THRESHOLD) {
        sources.push({ sensor: s, outflow: Math.abs(delta) });
      } else if (delta > MIN_FLOW_THRESHOLD) {
        sinks.push({ sensor: s, inflow: delta });
      }
    }

    if (sources.length === 0 || sinks.length === 0) continue;

    // Gravity model: distribute each source's outflow to nearby sinks
    const flowPairs: { from: SensorPosition; to: SensorPosition; flow: number }[] = [];

    for (const src of sources) {
      const srcNeighbours = neighbours.get(src.sensor.sensor_id) || [];

      // Find sinks among neighbours
      const sinkSet = new Set(sinks.map((s) => s.sensor.sensor_id));
      const nearbySinks = srcNeighbours.filter((n) => sinkSet.has(n.sensor.sensor_id));

      if (nearbySinks.length === 0) continue;

      // Gravity weights: inflow / dist^2
      const sinkInflowMap = new Map(sinks.map((s) => [s.sensor.sensor_id, s.inflow]));
      let totalWeight = 0;
      const weights: { sensor: SensorPosition; weight: number }[] = [];

      for (const ns of nearbySinks) {
        const inflow = sinkInflowMap.get(ns.sensor.sensor_id) || 0;
        // Gravity: attract proportional to inflow, inversely to distance squared
        const w = inflow / (ns.dist * ns.dist);
        weights.push({ sensor: ns.sensor, weight: w });
        totalWeight += w;
      }

      if (totalWeight === 0) continue;

      // Distribute outflow
      for (const { sensor: sinkSensor, weight } of weights) {
        const flow = src.outflow * (weight / totalWeight);
        if (flow < MIN_FLOW_THRESHOLD * 0.5) continue;
        flowPairs.push({ from: src.sensor, to: sinkSensor, flow });
        if (flow > globalMaxFlow) globalMaxFlow = flow;
      }
    }

    // Keep top flows for this hour
    flowPairs.sort((a, b) => b.flow - a.flow);
    const topFlows = flowPairs.slice(0, MAX_FLOWS_PER_HOUR);

    // Generate trips for each flow pair
    for (const { from, to, flow } of topFlows) {
      // Alternate curvature direction based on sensor IDs for visual variety
      const curvature = ((from.sensor_id + to.sensor_id) % 2 === 0 ? 0.2 : -0.2);
      const routeKey = `${from.sensor_id}-${to.sensor_id}`;
      const streetPath = streetRoutes?.get(routeKey);
      const path = streetPath && streetPath.length >= 2
        ? resamplePath(streetPath, PATH_POINTS)
        : bezierPath(
            [from.lon, from.lat],
            [to.lon, to.lat],
            PATH_POINTS,
            curvature,
          );

      // Timestamps: spread across the hour transition with slight offset
      const startTime = hour + 0.1;
      const endTime = hour + 0.9;
      const timestamps: number[] = [];
      for (let i = 0; i < PATH_POINTS; i++) {
        timestamps.push(startTime + (endTime - startTime) * (i / (PATH_POINTS - 1)));
      }

      // Colour: warm orange-red gradient based on flow intensity
      const intensity = Math.min(flow / Math.max(globalMaxFlow, 1), 1);
      const r = Math.round(255);
      const g = Math.round(160 - intensity * 80);
      const b = Math.round(60 - intensity * 40);

      allTrips.push({
        path,
        timestamps,
        magnitude: flow,
        color: [r, g, b],
      });
    }
  }

  // Normalise magnitudes to 0-1
  if (globalMaxFlow > 0) {
    for (const trip of allTrips) {
      trip.magnitude = trip.magnitude / globalMaxFlow;
    }
  }

  return allTrips;
}

/**
 * Return the unique sensor pairs that would be used in flow computation,
 * without generating full trip objects. Used by useStreetRoutes to
 * pre-fetch OSRM walking routes for all relevant pairs.
 */
export function getFlowSensorPairs(
  sensors: SensorPosition[],
  hourlyIndex: HourlyIndex,
): { fromId: number; toId: number; fromLon: number; fromLat: number; toLon: number; toLat: number }[] {
  if (sensors.length === 0 || hourlyIndex.size === 0) return [];

  // Pre-compute pairwise distances (only for nearby sensors)
  const neighbours = new Map<number, { sensor: SensorPosition; dist: number }[]>();

  for (const a of sensors) {
    const nearby: { sensor: SensorPosition; dist: number }[] = [];
    for (const b of sensors) {
      if (a.sensor_id === b.sensor_id) continue;
      const d = distanceMetres(a.lat, a.lon, b.lat, b.lon);
      if (d <= MAX_FLOW_DISTANCE) {
        nearby.push({ sensor: b, dist: d });
      }
    }
    nearby.sort((a, b) => a.dist - b.dist);
    neighbours.set(a.sensor_id, nearby);
  }

  const seenPairs = new Set<string>();
  const pairs: { fromId: number; toId: number; fromLon: number; fromLat: number; toLon: number; toLat: number }[] = [];

  for (let hour = 0; hour < 23; hour++) {
    const sources: { sensor: SensorPosition; outflow: number }[] = [];
    const sinks: { sensor: SensorPosition; inflow: number }[] = [];

    for (const s of sensors) {
      const hours = hourlyIndex.get(s.sensor_id);
      if (!hours) continue;
      const delta = hours[hour + 1] - hours[hour];

      if (delta < -MIN_FLOW_THRESHOLD) {
        sources.push({ sensor: s, outflow: Math.abs(delta) });
      } else if (delta > MIN_FLOW_THRESHOLD) {
        sinks.push({ sensor: s, inflow: delta });
      }
    }

    if (sources.length === 0 || sinks.length === 0) continue;

    const sinkSet = new Set(sinks.map((s) => s.sensor.sensor_id));
    const sinkInflowMap = new Map(sinks.map((s) => [s.sensor.sensor_id, s.inflow]));

    for (const src of sources) {
      const srcNeighbours = neighbours.get(src.sensor.sensor_id) ?? [];
      const nearbySinks = srcNeighbours.filter((n) => sinkSet.has(n.sensor.sensor_id));

      if (nearbySinks.length === 0) continue;

      let totalWeight = 0;
      const weights: { sensor: SensorPosition; weight: number }[] = [];

      for (const ns of nearbySinks) {
        const inflow = sinkInflowMap.get(ns.sensor.sensor_id) ?? 0;
        const w = inflow / (ns.dist * ns.dist);
        weights.push({ sensor: ns.sensor, weight: w });
        totalWeight += w;
      }

      if (totalWeight === 0) continue;

      for (const { sensor: sinkSensor, weight } of weights) {
        const flow = src.outflow * (weight / totalWeight);
        if (flow < MIN_FLOW_THRESHOLD * 0.5) continue;

        const pairKey = `${src.sensor.sensor_id}-${sinkSensor.sensor_id}`;
        if (!seenPairs.has(pairKey)) {
          seenPairs.add(pairKey);
          pairs.push({
            fromId: src.sensor.sensor_id,
            toId: sinkSensor.sensor_id,
            fromLon: src.sensor.lon,
            fromLat: src.sensor.lat,
            toLon: sinkSensor.lon,
            toLat: sinkSensor.lat,
          });
        }
      }
    }
  }

  return pairs;
}
