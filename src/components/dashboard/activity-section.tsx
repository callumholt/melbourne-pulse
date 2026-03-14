"use client";

import { useState, useEffect } from "react";
import { format, subDays } from "date-fns";
import { ActivityChart } from "./activity-chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ActivitySectionProps {
  initialHourlyData: Array<{ hour: number; [precinctId: string]: number }>;
  precinctNames: Record<string, { name: string; colour: string }>;
  initialDate: string;
}

export function ActivitySection({ initialHourlyData, precinctNames, initialDate }: ActivitySectionProps) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [hourlyData, setHourlyData] = useState(initialHourlyData);
  const [loading, setLoading] = useState(false);

  // Generate date options for last 90 days
  const dateOptions: { value: string; label: string }[] = [];
  for (let i = 0; i < 90; i++) {
    const d = subDays(new Date(), i);
    const value = format(d, "yyyy-MM-dd");
    const label = i === 0
      ? "Today"
      : i === 1
        ? "Yesterday"
        : format(d, "EEE d MMM");
    dateOptions.push({ value, label });
  }

  useEffect(() => {
    if (selectedDate === initialDate) {
      setHourlyData(initialHourlyData);
      return;
    }

    setLoading(true);
    fetch(`/api/hourly?date=${selectedDate}`)
      .then((res) => res.json())
      .then((rows: Array<{ precinct_id: string; hour_of_day: number; total_count: number }>) => {
        const hourlyMap = new Map<number, Record<string, number>>();
        for (let h = 0; h < 24; h++) {
          hourlyMap.set(h, { hour: h });
        }
        for (const row of rows) {
          const entry = hourlyMap.get(Number(row.hour_of_day))!;
          entry[row.precinct_id] = Number(row.total_count);
        }
        setHourlyData(Array.from(hourlyMap.values()) as Array<{ hour: number; [precinctId: string]: number }>);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedDate, initialDate, initialHourlyData]);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Hourly Activity</h2>
        <Select value={selectedDate} onValueChange={(v) => v && setSelectedDate(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dateOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className={loading ? "opacity-50 transition-opacity" : ""}>
        <ActivityChart hourlyData={hourlyData} precinctNames={precinctNames} />
      </div>
    </section>
  );
}
