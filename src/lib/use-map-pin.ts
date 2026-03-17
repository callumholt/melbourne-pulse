"use client";

import { useState, useCallback } from "react";

export interface MapPin {
	lat: number;
	lon: number;
	address: string | null;
	road: string | null;
	suburb: string | null;
	estimatedCount: number | null;
	loading: boolean;
}

interface SensorData {
	sensor_id: number;
	sensor_name: string;
	lat: number;
	lon: number;
	precinct_id: string;
	total_count: number;
}

type HourlyIndex = Map<number, Float64Array>;

const RADIUS_METRES = 500;

/**
 * Haversine distance between two lat/lon points in metres.
 */
function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
 * Estimate pedestrian count at a given lat/lon using Inverse Distance Weighting
 * from nearby sensors within RADIUS_METRES.
 *
 * If hourlyIndex and currentTime are provided, uses the interpolated hourly count.
 * Otherwise falls back to each sensor's total_count.
 *
 * Returns null if no sensors are within range.
 */
function estimateByIDW(
	lat: number,
	lon: number,
	sensors: SensorData[],
	hourlyIndex: HourlyIndex | null,
	currentTime: number | null,
): number | null {
	let weightedSum = 0;
	let totalWeight = 0;

	for (const sensor of sensors) {
		const dist = haversineMetres(lat, lon, sensor.lat, sensor.lon);
		if (dist > RADIUS_METRES) continue;

		// Avoid division by zero for exact sensor location
		const effectiveDist = Math.max(dist, 1);
		const weight = 1 / (effectiveDist ** 2);

		let count = sensor.total_count;

		if (hourlyIndex !== null && currentTime !== null) {
			const hours = hourlyIndex.get(sensor.sensor_id);
			if (hours) {
				const hourIndex = Math.floor(currentTime) % 24;
				const nextHourIndex = (hourIndex + 1) % 24;
				const frac = currentTime - Math.floor(currentTime);
				count = hours[hourIndex] * (1 - frac) + hours[nextHourIndex] * frac;
			}
		}

		weightedSum += count * weight;
		totalWeight += weight;
	}

	if (totalWeight === 0) return null;

	return Math.round(weightedSum / totalWeight);
}

/**
 * Hook for managing a dropped pin on the map with reverse geocoding
 * and IDW-based pedestrian count estimation.
 */
export function useMapPin(
	sensors: SensorData[],
	hourlyIndex: HourlyIndex | null,
	currentTime: number | null,
) {
	const [pin, setPin] = useState<MapPin | null>(null);

	const dropPin = useCallback(
		(lat: number, lon: number) => {
			// Set loading state immediately
			setPin({
				lat,
				lon,
				address: null,
				road: null,
				suburb: null,
				estimatedCount: null,
				loading: true,
			});

			// Calculate estimated count synchronously from current sensor data
			const estimatedCount = estimateByIDW(lat, lon, sensors, hourlyIndex, currentTime);

			// Fetch reverse geocode asynchronously
			fetch(`/api/geocode?lat=${lat}&lon=${lon}`)
				.then((res) => {
					if (!res.ok) throw new Error(`Geocode request failed: ${res.status}`);
					return res.json() as Promise<{ address: string; road: string | null; suburb: string | null }>;
				})
				.then((data) => {
					setPin((prev) => {
						// Discard result if pin has been cleared or moved
						if (!prev || prev.lat !== lat || prev.lon !== lon) return prev;
						return {
							lat,
							lon,
							address: data.address,
							road: data.road,
							suburb: data.suburb,
							estimatedCount,
							loading: false,
						};
					});
				})
				.catch(() => {
					setPin((prev) => {
						if (!prev || prev.lat !== lat || prev.lon !== lon) return prev;
						return {
							lat,
							lon,
							address: null,
							road: null,
							suburb: null,
							estimatedCount,
							loading: false,
						};
					});
				});
		},
		[sensors, hourlyIndex, currentTime],
	);

	const clearPin = useCallback(() => {
		setPin(null);
	}, []);

	return { pin, setPin: dropPin, clearPin };
}
