"use client";

import { PrecinctCard } from "./precinct-card";

interface TreeStats {
  tree_count: number;
  species_count: number;
  health_score: number;
}

interface Precinct {
  id: string;
  name: string;
  colour: string;
  count: number;
  historicalMax: number;
  ratio: number;
  treeStats?: TreeStats | null;
}

interface PrecinctGridProps {
  precincts: Precinct[];
  onLocateClick?: (precinctId: string) => void;
}

export function PrecinctGrid({ precincts, onLocateClick }: PrecinctGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
      {precincts.map((precinct) => (
        <PrecinctCard
          key={precinct.id}
          id={precinct.id}
          name={precinct.name}
          colour={precinct.colour}
          count={precinct.count}
          historicalMax={precinct.historicalMax}
          ratio={precinct.ratio}
          treeStats={precinct.treeStats}
          onLocateClick={onLocateClick ? () => onLocateClick(precinct.id) : undefined}
        />
      ))}
    </div>
  );
}
