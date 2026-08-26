import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";

// Example saved location — Sukhumvit, Bangkok
// For production, replace with Google Maps API + real user location
export const EXAMPLE_SAVED_LOCATION = {
  name: "Your Saved Location",
  address: "Sukhumvit Rd, Khlong Toei, Bangkok 10110",
  lat: 13.7306,
  lng: 100.5688,
};

const SCHOOLS_WITH_COORDS = [
  { id: 1, name: "Bangkok Patana School",       lat: 13.6962, lng: 100.6022, tuition: "฿420K", rating: 4.8 },
  { id: 2, name: "NIST International School",   lat: 13.7414, lng: 100.5599, tuition: "฿510K", rating: 4.7 },
  { id: 3, name: "Ruamrudee International",      lat: 13.7862, lng: 100.6149, tuition: "฿380K", rating: 4.6 },
  { id: 4, name: "Harrow International School",  lat: 13.7248, lng: 100.4847, tuition: "฿560K", rating: 4.9 },
  { id: 5, name: "ISB Bangkok",                  lat: 13.8873, lng: 100.5524, tuition: "฿490K", rating: 4.7 },
  { id: 6, name: "Shrewsbury International",     lat: 13.7014, lng: 100.5220, tuition: "฿530K", rating: 4.8 },
];

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

      // OpenStreetMap tiles — no API key needed
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Saved location marker (home pin)
      const homeIcon = L.divIcon({
        html: `<div style="
          width:36px;height:36px;border-radius:50% 50% 50% 0;
          background:#1c1917;
          transform:rotate(-45deg);
          border:3px solid #faf8f5;
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

      L.marker([EXAMPLE_SAVED_LOCATION.lat, EXAMPLE_SAVED_LOCATION.lng], { icon: homeIcon })
        .addTo(map)
        .bindPopup(
          `<div style="font-family:system-ui;min-width:160px">
            <div style="font-weight:700;color:#1c1917;margin-bottom:2px">${EXAMPLE_SAVED_LOCATION.name}</div>
            <div style="font-size:12px;color:#78716c">${EXAMPLE_SAVED_LOCATION.address}</div>
            <div style="font-size:11px;margin-top:6px;color:#ab8e72;font-weight:600">📍 Your saved location</div>
          </div>`,
          { maxWidth: 220 }
        )
        .openPopup();

      // School markers
      const schoolIcon = (rating: number) => L.divIcon({
        html: `<div style="
          background:#faf8f5;
          border:2px solid #ab8e72;
          border-radius:20px;
          padding:3px 8px;
          font-size:11px;
          font-weight:700;
          color:#1c1917;
          white-space:nowrap;
          box-shadow:0 2px 8px rgba(28,25,23,0.12);
          display:flex;align-items:center;gap:3px;
        ">⭐ ${rating}</div>`,
        iconSize: [52, 24],
        iconAnchor: [26, 12],
        className: "",
      });

      SCHOOLS_WITH_COORDS.forEach((school) => {
        const distKm = getDistance(
          EXAMPLE_SAVED_LOCATION.lat, EXAMPLE_SAVED_LOCATION.lng,
          school.lat, school.lng
        );
        L.marker([school.lat, school.lng], { icon: schoolIcon(school.rating) })
          .addTo(map)
          .bindPopup(
            `<div style="font-family:system-ui;min-width:180px">
              <div style="font-weight:700;color:#1c1917;margin-bottom:3px">${school.name}</div>
              <div style="font-size:12px;color:#ab8e72;font-weight:600">From ${school.tuition}/yr</div>
              <div style="font-size:12px;color:#78716c;margin-top:2px">⭐ ${school.rating} · ${distKm} km from you</div>
            </div>`,
            { maxWidth: 220 }
          );
      });

      // Draw radius circle from saved location (10 km)
      L.circle([EXAMPLE_SAVED_LOCATION.lat, EXAMPLE_SAVED_LOCATION.lng], {
        radius: 10000,
        color: "#ab8e72",
        fillColor: "#ab8e72",
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

function getDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1);
}
