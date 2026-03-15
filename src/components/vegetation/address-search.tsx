"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X, MapPin } from "lucide-react";

interface AddressSearchProps {
  onSelect: (lat: number, lng: number, label: string) => void;
}

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

export function AddressSearch({ onSelect }: AddressSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 3) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      // Use Nominatim (OpenStreetMap) geocoder -- free, no API key
      const params = new URLSearchParams({
        q,
        format: "json",
        addressdetails: "1",
        limit: "6",
        countrycodes: "au",
        viewbox: "140.9,-39.2,150.0,-33.9", // Victoria bounding box
        bounded: "1",
      });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { "Accept-Language": "en" },
      });
      if (!res.ok) throw new Error(`Geocoder error: ${res.status}`);
      const data: SearchResult[] = await res.json();
      setResults(data);
      setOpen(data.length > 0);
    } catch (err) {
      console.error("Geocoding failed:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 350);
  };

  const handleSelect = (result: SearchResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setQuery(result.display_name.split(",").slice(0, 2).join(","));
    setOpen(false);
    onSelect(lat, lng, result.display_name);
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="absolute left-4 right-16 top-4 z-10 md:right-auto md:w-80">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search address or street..."
          className="h-10 w-full rounded-lg border border-border/40 bg-background/90 pl-9 pr-9 text-sm text-foreground shadow-sm backdrop-blur-sm placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {loading && (
          <div className="absolute right-9 top-1/2 -translate-y-1/2">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          </div>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="mt-1 max-h-64 overflow-y-auto rounded-lg border border-border/40 bg-background/95 py-1 shadow-lg backdrop-blur-sm">
          {results.map((result, i) => (
            <button
              key={i}
              onClick={() => handleSelect(result)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="line-clamp-2 text-foreground/90">
                {result.display_name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
