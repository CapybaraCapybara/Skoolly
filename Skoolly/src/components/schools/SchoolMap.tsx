import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import { getSchools } from "@/api/schoolsApi";
import { formatTuition } from "@/components/schools/SchoolCard";

// Example saved location — Sukhumvit, Bangkok
// For production, replace with the user's real saved location
export const EXAMPLE_SAVED_LOCATION = {
  name: "Your Saved Location",
  address: "Sukhumvit Rd, Khlong Toei, Bangkok 10110",
  lat: 13.7306,
  lng: 100.5688,
};

export const APPROXIMATE_PIN_NOTE = "ตำแหน่งโดยประมาณ";

export function SchoolMap() {
  const mapRef = useRef<LeafletMap | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Guard against HMR double-mount ("Map container already initialized")
    if ((el as any)._leaflet_id) return;

    import("leaflet").then((L) => {
      if (!containerRef.current || (containerRef.current as any)._leaflet_id) return;

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(containerRef.current!, {
        center: [EXAMPLE_SAVED_LOCATION.lat, EXAMPLE_SAVED_LOCATION.lng],
        zoom: 12,
        zoomControl: true,
        scrollWheelZoom: false,
      });

      mapRef.current = map;

      // OpenStreetMap tiles — no API key needed.
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · ' +
          '<a href="https://overturemaps.org">Overture Maps Foundation</a> · กรมการปกครอง',
        maxZoom: 19,
      }).addTo(map);

      // Saved location marker (home pin)
      const homeIcon = L.divIcon({
        html: `<div style="
          width:36px;height:36px;border-radius:50% 50% 50% 0;
          background:#14284b;
          transform:rotate(-45deg);
          border:3px solid #f8f6f1;
          box-shadow:0 3px 12px rgba(28,25,23,0.3);
        ">
          <div style="
            position:absolute;inset:0;display:flex;align-items:center;
            justify-content:center;transform:rotate(45deg);
          ">
            <svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='white' viewBox='0 0 24 24'>
              <path d='M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z'/>
            </svg>
          </div>
        </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        className: "",
      });

      // Keep the home pin above school pins, which can now be dense around it
      L.marker([EXAMPLE_SAVED_LOCATION.lat, EXAMPLE_SAVED_LOCATION.lng], { icon: homeIcon, zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup(
          `<div style="font-family:system-ui;min-width:160px">
            <div style="font-weight:700;color:#14284b;margin-bottom:2px">${EXAMPLE_SAVED_LOCATION.name}</div>
            <div style="font-size:12px;color:#78716c">${EXAMPLE_SAVED_LOCATION.address}</div>
            <div style="font-size:11px;margin-top:6px;color:#b8913a;font-weight:600">📍 Your saved location</div>
          </div>`,
          { maxWidth: 220 }
        )
        .openPopup();

      // School markers — an exact pin is a solid pill; an approximate one is dashed and muted
      const schoolIcon = (rating: number, approximate: boolean) => L.divIcon({
        html: `<div style="
          background:${approximate ? "rgba(250,248,245,0.85)" : "#f8f6f1"};
          border:2px ${approximate ? "dashed #a8a29e" : "solid #b8913a"};
          border-radius:20px;
          padding:3px 8px;
          font-size:11px;
          font-weight:${approximate ? 600 : 700};
          color:${approximate ? "#78716c" : "#14284b"};
          white-space:nowrap;
          box-shadow:0 2px 8px rgba(28,25,23,0.12);
          display:flex;align-items:center;gap:3px;
        ">${approximate ? "≈ " : ""}${rating > 0 ? `⭐ ${rating}` : "🏫"}</div>`,
        iconSize: approximate ? [62, 24] : [52, 24],
        iconAnchor: approximate ? [31, 12] : [26, 12],
        className: "",
      });

      // Real pins from school_data.schools via schoolsApi; schools without usable coordinates have no coords
      getSchools()
        .then((schools) => {
          if (mapRef.current !== map) return;

          schools.forEach((school) => {
            if (!school.coords) return;
            const { lat, lng, precision } = school.coords;
            const approximate = precision === "Approximate";
            const name = escapeHtml(school.name);
            const distKm = getDistance(EXAMPLE_SAVED_LOCATION.lat, EXAMPLE_SAVED_LOCATION.lng, lat, lng);
            const fee =
              school.tuitionStart > 0 ? `From ${formatTuition(school.tuitionStart)}/yr` : "Contact school for fees";
            const ratingText = school.rating > 0 ? `⭐ ${school.rating} · ` : "";

            const marker = L.marker([lat, lng], {
              icon: schoolIcon(school.rating, approximate),
              zIndexOffset: approximate ? 0 : 500,
            })
              .addTo(map)
              .bindPopup(
                `<div style="font-family:system-ui;min-width:180px">
                  <div style="font-weight:700;color:#14284b;margin-bottom:3px">${name}</div>
                  <div style="font-size:12px;color:#b8913a;font-weight:600">${fee}</div>
                  <div style="font-size:12px;color:#78716c;margin-top:2px">${ratingText}${distKm} km from you</div>
                  ${approximate ? `<div style="font-size:11px;color:#b45309;margin-top:4px">${APPROXIMATE_PIN_NOTE}</div>` : ""}
                </div>`,
                { maxWidth: 220 }
              );

            if (approximate) {
              marker.bindTooltip(
                `<div style="font-family:system-ui">
                  <div style="font-weight:600;color:#14284b">${name}</div>
                  <div style="font-size:11px;color:#b45309">${APPROXIMATE_PIN_NOTE}</div>
                </div>`,
                { direction: "top", offset: [0, -12] }
              );
            }
          });
        })
        .catch((error) => console.debug("[SchoolMap] school pins unavailable:", error));

      // Draw radius circle from saved location (10 km)
      L.circle([EXAMPLE_SAVED_LOCATION.lat, EXAMPLE_SAVED_LOCATION.lng], {
        radius: 10000,
        color: "#b8913a",
        fillColor: "#b8913a",
        fillOpacity: 0.04,
        weight: 1.5,
        dashArray: "6 4",
      }).addTo(map);
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full rounded-2xl overflow-hidden"
      style={{ minHeight: 400 }}
    />
  );
}

// School names come from the database and are rendered as popup HTML
function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

function getDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1);
}
