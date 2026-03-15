"use client";

import dynamic from "next/dynamic";

const VegetationMap = dynamic(
  () => import("./vegetation-map").then((m) => m.VegetationMap),
  { ssr: false },
);

export function VegetationMapLoader() {
  return <VegetationMap />;
}
