"use client";

import { PrecinctCard } from "./precinct-card";

interface Precinct {
  id: string;
  name: string;
  colour: string;
  count: number;
  historicalMax: number;
  ratio: number;
}

interface PrecinctGridProps {
  precincts: Precinct[];
}

export function PrecinctGrid({ precincts }: PrecinctGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
      {precincts.map((precinct) => (
        <PrecinctCard
          key={precinct.id}
          name={precinct.name}
          colour={precinct.colour}
          count={precinct.count}
          historicalMax={precinct.historicalMax}
          ratio={precinct.ratio}
        />
      ))}
    </div>
  );
}
