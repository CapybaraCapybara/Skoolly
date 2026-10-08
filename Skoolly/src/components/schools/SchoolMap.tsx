import { useEffect, useRef } from "react";
import L from "leaflet";
import type { School } from "@/types";
import { formatTuition } from "@/components/schools/SchoolCard";
import { curriculumLabel, schoolNames } from "@/lib/labels";

export interface MapPoint {
  lat: number;
  lng: number;
}

// Example location (Sukhumvit, Bangkok) until the visitor shares or picks their own
export const EXAMPLE_LOCATION = {
  lat: 13.7306,
  lng: 100.5688,
  label: "สุขุมวิท กรุงเทพฯ",
};

export type MapSelection = { id: number; from: "map" | "list" } | null;

interface SchoolMapProps {
  /** Schools to draw; ones without coordinates are skipped */
  schools: School[];
  center: MapPoint;
  radiusKm: number;
  nearbyIds: Set<number>;
  distances: Map<number, number>;
  selected: MapSelection;
  hoveredId: number | null;
  onSelect: (id: number) => void;
  onPopupClose: (id: number) => void;
  onHover: (id: number | null) => void;
  onCenterChange: (point: MapPoint) => void;
  onOpenSchool: (id: number) => void;
}

const NAVY = "#14284b";
const GOLD = "#b8913a";
const MUTED = "#8f9bb0";
const IVORY = "#f8f6f1";

type PinState = "selected" | "hovered" | "near" | "far";

function pinStyle(state: PinState, approximate: boolean): L.CircleMarkerOptions {
  if (state === "selected") {
    return { radius: 10, color: "#ffffff", weight: 3, dashArray: "", fillColor: GOLD, fillOpacity: 1 };
  }
  if (state === "hovered") {
    return approximate
      ? { radius: 9, color: GOLD, weight: 2.5, dashArray: "3 3", fillColor: IVORY, fillOpacity: 1 }
      : { radius: 9, color: "#ffffff", weight: 2, dashArray: "", fillColor: GOLD, fillOpacity: 1 };
  }
  if (state === "near") {
    return approximate
      ? { radius: 7, color: NAVY, weight: 2, dashArray: "3 3", fillColor: IVORY, fillOpacity: 1 }
      : { radius: 7, color: "#ffffff", weight: 2, dashArray: "", fillColor: NAVY, fillOpacity: 1 };
  }
  return approximate
    ? { radius: 5, color: MUTED, weight: 1.5, dashArray: "2 2", fillColor: IVORY, fillOpacity: 0.8 }
    : { radius: 5, color: "#ffffff", weight: 1, dashArray: "", fillColor: MUTED, fillOpacity: 0.8 };
}

export function formatDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} ม.` : `${km.toFixed(1)} กม.`;
}

// School names come from the database and are rendered as popup / tooltip HTML
function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

const homeIcon = L.divIcon({
  html: `<div style="
    width:32px;height:32px;border-radius:50% 50% 50% 0;
    background:${NAVY};transform:rotate(-45deg);
    border:3px solid ${IVORY};box-shadow:0 3px 10px rgba(20,40,75,0.35);">
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transform:rotate(45deg);">
      <svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='white' viewBox='0 0 24 24'><path d='M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z'/></svg>
    </div>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  className: "",
});

export function SchoolMap(props: SchoolMapProps) {
  const { schools, center, radiusKm, nearbyIds, selected, hoveredId } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const homeRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const pinsRef = useRef(new Map<number, { marker: L.CircleMarker; approximate: boolean }>());
  // Hover / selection are drawn as rings in their own pane instead of restyling and re-ordering the pins:
  // moving a pin's SVG node while it is under the pointer makes the browser drop its mouseout,
  // which left tooltips stuck open
  const hoverRingRef = useRef<L.CircleMarker | null>(null);
  const selectRingRef = useRef<L.CircleMarker | null>(null);
  const tooltipPinRef = useRef<L.CircleMarker | null>(null);
  // Leaflet handlers are bound once; they read the latest props through this ref
  const propsRef = useRef(props);
  propsRef.current = props;

  // ── Create the map once ────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = L.map(el, {
      center: [center.lat, center.lng],
      zoom: 12,
      scrollWheelZoom: true,
      // One wheel notch = one zoom level (Leaflet's default of 60 jumps two levels per notch)
      wheelPxPerZoomLevel: 120,
    });

    const activePane = map.createPane("pinsActive");
    activePane.style.zIndex = "450"; // above the pins (400), below the house pin and tooltips
    activePane.style.pointerEvents = "none";
    hoverRingRef.current = L.circleMarker([0, 0], { pane: "pinsActive", interactive: false });
    selectRingRef.current = L.circleMarker([0, 0], { pane: "pinsActive", interactive: false });

    // The wheel zooms the map, except while the page is being scrolled past it: if the wheel was just
    // turning outside the map, it keeps scrolling the page until the visitor pauses for a moment
    let lastPageWheel = 0;
    const onWindowWheel = (e: WheelEvent) => {
      if (!el.contains(e.target as Node)) lastPageWheel = performance.now();
    };
    const onMapWheel = (e: WheelEvent) => {
      const now = performance.now();
      if (now - lastPageWheel < 300) {
        lastPageWheel = now;
        e.stopPropagation(); // Leaflet never sees it, so the browser scrolls the page as usual
      }
    };
    const wheelGuard = el.parentElement ?? el;
    window.addEventListener("wheel", onWindowWheel, { capture: true, passive: true });
    wheelGuard.addEventListener("wheel", onMapWheel, { capture: true, passive: true });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · ' +
        '<a href="https://overturemaps.org">Overture Maps Foundation</a> · กรมการปกครอง',
      maxZoom: 19,
    }).addTo(map);

    const circle = L.circle([center.lat, center.lng], {
      radius: radiusKm * 1000,
      color: GOLD,
      weight: 1.5,
      dashArray: "6 4",
      fillColor: GOLD,
      fillOpacity: 0.06,
      interactive: false,
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);

    const home = L.marker([center.lat, center.lng], {
      icon: homeIcon,
      draggable: true,
      zIndexOffset: 1000,
      title: "ลากเพื่อย้ายจุด",
    }).addTo(map);
    home.on("drag", () => circle.setLatLng(home.getLatLng()));
    home.on("dragend", () => {
      const p = home.getLatLng();
      propsRef.current.onCenterChange({ lat: p.lat, lng: p.lng });
    });

    map.on("popupopen", (e) => {
      const button = e.popup.getElement()?.querySelector<HTMLButtonElement>("[data-open-school]");
      button?.addEventListener("click", () => propsRef.current.onOpenSchool(Number(button.dataset.openSchool)));
    });

    mapRef.current = map;
    homeRef.current = home;
    circleRef.current = circle;
    map.fitBounds(circle.getBounds(), { padding: [12, 12] });

    return () => {
      window.removeEventListener("wheel", onWindowWheel, { capture: true });
      wheelGuard.removeEventListener("wheel", onMapWheel, { capture: true });
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      hoverRingRef.current = null;
      selectRingRef.current = null;
      tooltipPinRef.current = null;
      pinsRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── School pins ────────────────────────────────────────────────────────────
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    pinsRef.current.clear();

    schools.forEach((school) => {
      if (!school.coords) return;
      const approximate = school.coords.precision === "Approximate";
      const marker = L.circleMarker([school.coords.lat, school.coords.lng], pinStyle("far", approximate))
        .bindTooltip(escapeHtml(schoolNames(school).primary), { direction: "top", offset: [0, -8] })
        .bindPopup(() => popupHtml(school, propsRef.current.distances.get(school.id)), {
          maxWidth: 240,
          offset: [0, -6],
        });
      marker.on("click", () => propsRef.current.onSelect(school.id));
      marker.on("mouseover", () => propsRef.current.onHover(school.id));
      marker.on("mouseout", () => propsRef.current.onHover(null));
      marker.on("popupopen", () => marker.closeTooltip());
      marker.on("popupclose", () => propsRef.current.onPopupClose(school.id));
      layer.addLayer(marker);
      pinsRef.current.set(school.id, { marker, approximate });
    });
  }, [schools]);

  // ── Pin styling: in range or further away ─────────────────────────────────
  // Runs only when the radius or location changes, never on hover
  useEffect(() => {
    pinsRef.current.forEach(({ marker, approximate }, id) => {
      const near = nearbyIds.has(id);
      marker.setStyle(pinStyle(near ? "near" : "far", approximate));
      if (near) marker.bringToFront();
    });
  }, [schools, nearbyIds]);

  // ── Hover: ring on top, plus the name when the hover comes from the list ──
  useEffect(() => {
    const map = mapRef.current;
    const ring = hoverRingRef.current;
    if (!map || !ring) return;
    const pin = hoveredId != null && hoveredId !== selected?.id ? pinsRef.current.get(hoveredId) : undefined;

    if (tooltipPinRef.current && tooltipPinRef.current !== pin?.marker) tooltipPinRef.current.closeTooltip();
    tooltipPinRef.current = pin?.marker ?? null;

    if (pin) {
      ring.setLatLng(pin.marker.getLatLng());
      ring.setStyle(pinStyle("hovered", pin.approximate));
      if (!map.hasLayer(ring)) ring.addTo(map);
      pin.marker.openTooltip();
    } else {
      ring.remove();
    }
  }, [schools, hoveredId, selected]);

  // ── Location and radius ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const circle = circleRef.current;
    const home = homeRef.current;
    if (!map || !circle || !home) return;
    home.setLatLng([center.lat, center.lng]);
    circle.setLatLng([center.lat, center.lng]);
    circle.setRadius(radiusKm * 1000);
    map.fitBounds(circle.getBounds(), { padding: [12, 12] });
  }, [center.lat, center.lng, radiusKm]);

  // ── Selection: open the popup, and fly to the school when picked from the list ─
  useEffect(() => {
    const map = mapRef.current;
    const ring = selectRingRef.current;
    if (!map || !ring) return;
    const pin = selected ? pinsRef.current.get(selected.id) : undefined;
    if (!selected || !pin) {
      ring.remove();
      map.closePopup();
      return;
    }
    const target = pin.marker.getLatLng();
    ring.setLatLng(target);
    ring.setStyle(pinStyle("selected", pin.approximate));
    if (!map.hasLayer(ring)) ring.addTo(map);
    if (selected.from === "list" && (map.getZoom() < 14 || !map.getBounds().pad(-0.1).contains(target))) {
      map.once("moveend", () => pin.marker.openPopup());
      map.flyTo(target, Math.max(map.getZoom(), 14), { duration: 0.6 });
    } else {
      pin.marker.openPopup();
    }
  }, [selected]);

  return <div ref={containerRef} className="w-full h-full" />;
}

function popupHtml(school: School, km: number | undefined) {
  const fee = school.tuitionStart > 0 ? `ค่าเทอมเริ่มต้น ${formatTuition(school.tuitionStart)}/ปี` : "ยังไม่เปิดเผยค่าเทอม";
  const meta = [km != null ? formatDistance(km) : null, curriculumLabel(school.curriculum)].filter(Boolean).join(" · ");
  const approximate =
    school.coords?.precision === "Approximate" ? `<div class="sk-popup-note">ตำแหน่งโดยประมาณ</div>` : "";
  return `<div class="sk-popup">
    <div class="sk-popup-name">${escapeHtml(schoolNames(school).primary)}</div>
    <div class="sk-popup-meta">${escapeHtml(meta)}</div>
    <div class="sk-popup-fee">${fee}</div>
    ${approximate}
    <button type="button" class="sk-popup-link" data-open-school="${school.id}">ดูโรงเรียน →</button>
  </div>`;
}
