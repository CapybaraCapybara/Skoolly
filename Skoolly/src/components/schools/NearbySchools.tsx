import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, LocateFixed, RotateCcw } from "lucide-react";
import type { School } from "@/types";
import { cn } from "@/lib/utils";
import { formatTuition } from "@/components/schools/SchoolCard";
import {
  SchoolMap,
  EXAMPLE_LOCATION,
  formatDistance,
  type MapPoint,
  type MapSelection,
} from "@/components/schools/SchoolMap";

const RADII = [5, 10, 20];

type LocationSource = "example" | "device" | "pin";

const LOCATION_LABEL: Record<LocationSource, string> = {
  example: `${EXAMPLE_LOCATION.label} (example)`,
  device: "your current location",
  pin: "the pinned location",
};

function distanceKm(a: MapPoint, b: MapPoint) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

interface NearbySchoolsProps {
  schools: School[];
  onOpenSchool: (id: number) => void;
}

export function NearbySchools({ schools, onOpenSchool }: NearbySchoolsProps) {
  const [center, setCenter] = useState<MapPoint>({ lat: EXAMPLE_LOCATION.lat, lng: EXAMPLE_LOCATION.lng });
  const [source, setSource] = useState<LocationSource>("example");
  const [radiusKm, setRadiusKm] = useState(10);
  const [selected, setSelected] = useState<MapSelection>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const mapped = useMemo(() => schools.filter((s) => s.coords), [schools]);

  const distances = useMemo(() => {
    const result = new Map<number, number>();
    mapped.forEach((s) => result.set(s.id, distanceKm(center, s.coords!)));
    return result;
  }, [mapped, center]);

  const nearby = useMemo(
    () =>
      mapped
        .filter((s) => (distances.get(s.id) ?? Infinity) <= radiusKm)
        .sort((a, b) => distances.get(a.id)! - distances.get(b.id)!),
    [mapped, distances, radiusKm]
  );
  const nearbyIds = useMemo(() => new Set(nearby.map((s) => s.id)), [nearby]);

  // A pin clicked on the map scrolls its row into view inside the list (not the page)
  useEffect(() => {
    if (selected?.from !== "map") return;
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-school-id="${selected.id}"]`);
    if (!list || !row) return;
    const top = row.offsetTop;
    if (top < list.scrollTop || top + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: Math.max(0, top - 8), behavior: "smooth" });
    }
  }, [selected]);

  const locateMe = () => {
    if (!("geolocation" in navigator)) {
      setGeoError("This browser can't share its location.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setSource("device");
        setSelected(null);
        setLocating(false);
      },
      () => {
        setGeoError("Couldn't get your location. Check the browser's location permission.");
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  const resetLocation = () => {
    setCenter({ lat: EXAMPLE_LOCATION.lat, lng: EXAMPLE_LOCATION.lng });
    setSource("example");
    setSelected(null);
    setGeoError(null);
  };

  return (
    <div>
      {/* Heading and controls */}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-warm-charcoal">Schools Near You</h2>
          <p className="text-warm-charcoal/60 text-sm mt-1">
            {nearby.length} school{nearby.length !== 1 ? "s" : ""} within {radiusKm} km of {LOCATION_LABEL[source]}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={locateMe}
            disabled={locating}
            className="inline-flex items-center gap-2 rounded-full border border-warm-accent bg-warm-cream px-4 py-2 text-sm font-medium text-warm-charcoal transition-colors hover:border-warm-bronze disabled:opacity-60 cursor-pointer"
          >
            <LocateFixed className="size-4 text-warm-bronze" />
            {locating ? "Locating…" : "Use my location"}
          </button>
          {source !== "example" && (
            <button
              type="button"
              onClick={resetLocation}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-warm-charcoal/60 transition-colors hover:text-warm-charcoal cursor-pointer"
            >
              <RotateCcw className="size-3.5" />
              Reset
            </button>
          )}
          <div role="group" aria-label="Search radius" className="flex rounded-full border border-warm-accent bg-warm-cream p-1">
            {RADII.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={radiusKm === r}
                onClick={() => {
                  setRadiusKm(r);
                  setSelected(null);
                }}
                className={cn(
                  "rounded-full px-3 py-1 text-sm font-medium transition-colors cursor-pointer",
                  radiusKm === r ? "bg-warm-charcoal text-white" : "text-warm-charcoal/70 hover:text-warm-charcoal"
                )}
              >
                {r} km
              </button>
            ))}
          </div>
        </div>
      </div>

      {geoError && <p className="-mt-2 mb-4 text-sm text-rose-700">{geoError}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Map */}
        <div className="lg:col-span-2">
          <div className="isolate h-[360px] sm:h-[480px] overflow-hidden rounded-[2rem] border border-warm-accent">
            <SchoolMap
              schools={mapped}
              center={center}
              radiusKm={radiusKm}
              nearbyIds={nearbyIds}
              distances={distances}
              selected={selected}
              hoveredId={hoveredId}
              onSelect={(id) => setSelected({ id, from: "map" })}
              onPopupClose={(id) => setSelected((cur) => (cur?.id === id ? null : cur))}
              onHover={setHoveredId}
              onCenterChange={(point) => {
                setCenter(point);
                setSource("pin");
                setSelected(null);
              }}
              onOpenSchool={onOpenSchool}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-warm-charcoal/60">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-warm-charcoal ring-2 ring-white" />
              Within {radiusKm} km
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#8f9bb0]" />
              Further away
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-full border-2 border-dashed border-warm-charcoal bg-warm-bg" />
              Approximate location
            </span>
            <span>Drag the house pin to move it</span>
          </div>
        </div>

        {/* Nearest schools */}
        <div className="flex h-[360px] sm:h-[480px] flex-col overflow-hidden rounded-[2rem] border border-warm-accent bg-warm-cream">
          <div className="flex items-center justify-between border-b border-warm-accent px-5 py-3.5">
            <h3 className="text-sm font-bold text-warm-charcoal">Nearest first</h3>
            <span className="text-xs text-warm-charcoal/60">{nearby.length} schools</span>
          </div>

          <div ref={listRef} className="relative flex-1 overflow-y-auto scrollbar-thin">
            {schools.length === 0 ? (
              <p className="p-5 text-sm text-warm-charcoal/60">Loading schools…</p>
            ) : nearby.length === 0 ? (
              <p className="p-5 text-sm text-warm-charcoal/60">
                No schools within {radiusKm} km. Try a larger radius.
              </p>
            ) : (
              nearby.map((school) => {
                const isSelected = selected?.id === school.id;
                const approximate = school.coords?.precision === "Approximate";
                return (
                  <div
                    key={school.id}
                    data-school-id={school.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected({ id: school.id, from: "list" })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected({ id: school.id, from: "list" });
                      }
                    }}
                    onMouseEnter={() => setHoveredId(school.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={cn(
                      "border-b border-warm-accent/60 px-5 py-3 transition-colors cursor-pointer outline-none focus-visible:bg-white",
                      isSelected ? "bg-warm-card" : hoveredId === school.id ? "bg-white/80" : "hover:bg-white/80"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-warm-charcoal line-clamp-1">{school.name}</div>
                        <div className="mt-0.5 text-xs text-warm-charcoal/60 line-clamp-1">
                          {school.curriculum} ·{" "}
                          {school.tuitionStart > 0 ? `from ${formatTuition(school.tuitionStart)}/yr` : "fees not published"}
                        </div>
                      </div>
                      <span
                        className="shrink-0 text-xs font-semibold tabular-nums text-warm-bronze"
                        title={approximate ? "Approximate location" : undefined}
                      >
                        {approximate ? "≈ " : ""}
                        {formatDistance(distances.get(school.id) ?? 0)}
                      </span>
                    </div>
                    {isSelected && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenSchool(school.id);
                        }}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-warm-charcoal hover:text-warm-bronze cursor-pointer"
                      >
                        View school
                        <ArrowRight className="size-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
