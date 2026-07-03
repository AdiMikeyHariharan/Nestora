import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import { Link } from "react-router-dom";
import { fmtPrice } from "../api.js";
import { useApp } from "../store.jsx";

const pricePin = (p, currency) => L.divIcon({
  className: "",
  html: `<span class="price-pin${p.type === "rent" ? " rent" : ""}">${fmtPrice(p.priceINR, p.type === "rent", currency)}</span>`,
  iconSize: [0, 0], iconAnchor: [40, 34]
});
const landmarkPin = L.divIcon({ className: "", html: `<span class="landmark-pin"></span>`, iconSize: [0, 0], iconAnchor: [9, 9] });

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) { map.setView(points[0], 13); return; }
    map.fitBounds(L.latLngBounds(points), { padding: [46, 46], maxZoom: 14 });
  }, [JSON.stringify(points)]); // eslint-disable-line
  return null;
}

// Interactive map of properties. `landmark` (optional): {name, lat, lng} + radiusKm circle.
export default function MapPanel({ properties, landmark, radiusKm, height }) {
  const { currency } = useApp();
  const located = properties.filter(p => p.lat != null && p.lng != null);
  const points = useMemo(() => {
    const pts = located.map(p => [p.lat, p.lng]);
    if (landmark) pts.push([landmark.lat, landmark.lng]);
    return pts;
  }, [located, landmark]);

  return (
    <div className="map-panel" style={height ? { height } : undefined}>
      <MapContainer center={[20.6, 78.9]} zoom={5} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />
        {landmark && (<>
          <Marker position={[landmark.lat, landmark.lng]} icon={landmarkPin}>
            <Popup><div className="map-popup"><b>📍 {landmark.name}</b><small>Search centre</small></div></Popup>
          </Marker>
          {radiusKm && <Circle center={[landmark.lat, landmark.lng]} radius={radiusKm * 1000}
            pathOptions={{ color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.07, weight: 1.5, dashArray: "6 6" }} />}
        </>)}
        {located.map(p => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={pricePin(p, currency)}>
            <Popup>
              <div className="map-popup">
                <b>{p.title}</b>
                <small>{p.area}, {p.city}{p.distance_km != null ? ` · ${p.distance_km} km away` : ""}</small>
                <Link to={`/property/${p.id}`}>View details →</Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
