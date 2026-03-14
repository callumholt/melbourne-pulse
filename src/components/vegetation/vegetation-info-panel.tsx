"use client";

import { X } from "lucide-react";
import type { FeatureInfo, LayerKey } from "./vegetation-map";

interface VegetationInfoPanelProps {
  info: FeatureInfo;
  onClose: () => void;
}

interface FieldDef {
  key: string;
  label: string;
  format?: (v: string | number) => string;
}

const PANEL_CONFIG: Record<LayerKey, { title: string; fields: FieldDef[] }> = {
  evc: {
    title: "Ecological Vegetation Class",
    fields: [
      { key: "x_evcname", label: "Vegetation Class" },
      { key: "evc_bcs_desc", label: "Conservation Status" },
      { key: "bioregion", label: "Bioregion" },
      { key: "evc_go_desc", label: "Geographic Occurrence" },
      { key: "x_groupname", label: "EVC Group" },
      { key: "x_subgroupname", label: "EVC Subgroup" },
      { key: "hectares", label: "Area (ha)", format: (v) => Number(v).toFixed(2) },
    ],
  },
  plantation: {
    title: "Plantation",
    fields: [
      { key: "plantation_type", label: "Type", format: (v) => String(v).charAt(0) + String(v).slice(1).toLowerCase() },
      { key: "feature_subtype", label: "Feature" },
    ],
  },
  nativeForest: {
    title: "Private Native Forest Stand",
    fields: [
      { key: "x_spp_common", label: "Dominant Species" },
      { key: "x_spp", label: "Scientific Name" },
      { key: "x_spp2_common", label: "Secondary Species" },
      { key: "x_vegform", label: "Vegetation Form" },
      { key: "x_height", label: "Canopy Height" },
      { key: "x_density", label: "Crown Cover" },
      { key: "hectares", label: "Area (ha)", format: (v) => Number(v).toFixed(2) },
    ],
  },
  vicforests: {
    title: "VicForests Timber Allocation",
    fields: [
      { key: "forest_stands", label: "Forest Type" },
      { key: "area_ha", label: "Area (ha)", format: (v) => Number(v).toFixed(2) },
      { key: "version", label: "Version" },
    ],
  },
  treeDensity: {
    title: "Tree Density",
    fields: [
      { key: "tree_density", label: "Density", format: (v) => String(v).charAt(0).toUpperCase() + String(v).slice(1) },
      { key: "feature_subtype", label: "Type" },
    ],
  },
};

const STATUS_COLOURS: Record<string, string> = {
  Endangered: "text-red-400",
  Vulnerable: "text-orange-400",
  Depleted: "text-yellow-400",
  Rare: "text-purple-400",
  "Least Concern": "text-green-400",
};

export function VegetationInfoPanel({ info, onClose }: VegetationInfoPanelProps) {
  const config = PANEL_CONFIG[info.type];
  const props = info.properties;

  return (
    <div className="absolute bottom-6 right-4 w-80 rounded-lg border border-border/40 bg-background/90 p-4 shadow-lg backdrop-blur-sm">
      <div className="mb-3 flex items-start justify-between">
        <h3 className="text-sm font-semibold">{config.title}</h3>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        {config.fields.map(({ key, label, format }) => {
          const raw = props[key];
          if (raw == null || String(raw).trim() === "" || raw === "UNCLASSIFIED") return null;

          const value = format ? format(raw) : String(raw);
          const isStatus = key === "evc_bcs_desc";
          const colourClass = isStatus ? STATUS_COLOURS[value] ?? "" : "";

          return (
            <div key={key}>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70">{label}</div>
              <div className={`text-sm ${colourClass ? `${colourClass} font-medium` : ""}`}>{value}</div>
            </div>
          );
        })}
        <div className="pt-1 text-[10px] text-muted-foreground/50">
          {info.lngLat.lat.toFixed(4)}, {info.lngLat.lng.toFixed(4)}
        </div>
      </div>
    </div>
  );
}
