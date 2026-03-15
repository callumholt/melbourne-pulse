import type { Metadata } from "next";
import { Navbar } from "@/components/navbar";
import { VegetationMapLoader } from "@/components/vegetation/vegetation-map-loader";

export const metadata: Metadata = {
  title: "Vegetation Cover - Melbourne Pulse",
  description:
    "Interactive map of Victorian land cover, ecological vegetation classes, and forest types across Victoria",
};

export default function VegetationPage() {
  return (
    <>
      <Navbar />
      <main className="relative h-[calc(100dvh-3.5rem)]">
        <VegetationMapLoader />
      </main>
    </>
  );
}
