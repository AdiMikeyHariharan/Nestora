// Geocoding: OSM Nominatim (precise) with Photon fallback (fuzzy, good for POI
// names like restaurants). In-memory cached. Keep the UA header — OSM policy.
import { Injectable } from "@nestjs/common";

export interface GeoResult { name: string; full: string; lat: number; lng: number; kind: string; }

@Injectable()
export class GeoService {
  private cache = new Map<string, GeoResult[]>();

  distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371, toRad = (d: number) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  clusterAndRecommend(properties: any[], userLat: number, userLng: number, epsKm = 10, minPts = 2, maxDistanceKm = 50) {
    const geoProps = properties.filter(p => p.lat != null && p.lng != null && !isNaN(p.lat) && !isNaN(p.lng));
    if (geoProps.length === 0) {
      return { clusters: [] };
    }

    const n = geoProps.length;
    const visited = new Set<number>();
    const clusterIds = new Array(n).fill(-1);
    let clusterCount = 0;

    const getNeighbors = (index: number) => {
      const neighbors: number[] = [];
      const p1 = geoProps[index];
      for (let i = 0; i < n; i++) {
        const p2 = geoProps[i];
        if (this.distanceKm(p1.lat, p1.lng, p2.lat, p2.lng) <= epsKm) {
          neighbors.push(i);
        }
      }
      return neighbors;
    };

    for (let i = 0; i < n; i++) {
      if (visited.has(i)) continue;
      visited.add(i);

      const neighbors = getNeighbors(i);
      if (neighbors.length < minPts) {
        clusterIds[i] = -1;
      } else {
        clusterIds[i] = clusterCount;
        const queue = [...neighbors];
        for (let j = 0; j < queue.length; j++) {
          const neighborIdx = queue[j];
          if (!visited.has(neighborIdx)) {
            visited.add(neighborIdx);
            const neighborNeighbors = getNeighbors(neighborIdx);
            if (neighborNeighbors.length >= minPts) {
              for (const nn of neighborNeighbors) {
                if (!queue.includes(nn)) {
                  queue.push(nn);
                }
              }
            }
          }
          if (clusterIds[neighborIdx] === -1) {
            clusterIds[neighborIdx] = clusterCount;
          }
        }
        clusterCount++;
      }
    }

    const clustersMap = new Map<number, any[]>();
    const noiseProps: any[] = [];

    for (let i = 0; i < n; i++) {
      const p = geoProps[i];
      const cid = clusterIds[i];
      if (cid === -1) {
        noiseProps.push(p);
      } else {
        if (!clustersMap.has(cid)) {
          clustersMap.set(cid, []);
        }
        clustersMap.get(cid)!.push(p);
      }
    }

    const formattedClusters: any[] = [];
    const getDist = (lat1: number, lng1: number, lat2: number, lng2: number) => {
      return +this.distanceKm(lat1, lng1, lat2, lng2).toFixed(1);
    };

    for (const [cid, props] of clustersMap.entries()) {
      const sumLat = props.reduce((acc, p) => acc + p.lat, 0);
      const sumLng = props.reduce((acc, p) => acc + p.lng, 0);
      const centroidLat = sumLat / props.length;
      const centroidLng = sumLng / props.length;

      let closestProp = props[0];
      let minCentroidDist = Infinity;
      for (const p of props) {
        const d = this.distanceKm(p.lat, p.lng, centroidLat, centroidLng);
        if (d < minCentroidDist) {
          minCentroidDist = d;
          closestProp = p;
        }
      }

      const clusterName = closestProp.area && closestProp.city
        ? `${closestProp.area}, ${closestProp.city}`
        : closestProp.city || "Nearby Area";

      const distToUser = getDist(userLat, userLng, centroidLat, centroidLng);
      const clusteredProps = props.map(p => ({
        ...p,
        distance_km: getDist(userLat, userLng, p.lat, p.lng)
      })).sort((a, b) => a.distance_km - b.distance_km);

      formattedClusters.push({
        id: `cluster-${cid}`,
        name: clusterName,
        isCluster: true,
        size: props.length,
        centroid: { lat: centroidLat, lng: centroidLng },
        distance_km: distToUser,
        properties: clusteredProps
      });
    }

    noiseProps.forEach((p, idx) => {
      const distToUser = getDist(userLat, userLng, p.lat, p.lng);
      const pWithDist = { ...p, distance_km: distToUser };

      const clusterName = p.area && p.city
        ? `${p.area}, ${p.city}`
        : p.city || "Nearby Property";

      formattedClusters.push({
        id: `noise-${idx}`,
        name: clusterName,
        isCluster: false,
        size: 1,
        centroid: { lat: p.lat, lng: p.lng },
        distance_km: distToUser,
        properties: [pWithDist]
      });
    });

    formattedClusters.sort((a, b) => a.distance_km - b.distance_km);
    const nearbyClusters = formattedClusters.filter(c => c.distance_km <= maxDistanceKm);
    return { clusters: nearbyClusters };
  }

  async geocode(text: string): Promise<GeoResult[]> {
    const key = text.trim().toLowerCase();
    if (this.cache.has(key)) return this.cache.get(key);

    let results: GeoResult[] = [];
    try {
      const url = "https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=in&q=" + encodeURIComponent(text);
      const resp = await fetch(url, { headers: { "User-Agent": "NestoraDemo/1.0 (demo real-estate site)" } });
      if (resp.ok) {
        results = (await resp.json() as any[]).map(r => ({
          name: r.display_name.split(",").slice(0, 3).join(",").trim(),
          full: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon), kind: r.type
        }));
      }
    } catch { /* fall through to Photon */ }

    if (!results.length) {
      const url = "https://photon.komoot.io/api/?limit=5&lang=en&bbox=68,6,98,36&q=" + encodeURIComponent(text);
      const resp = await fetch(url, { headers: { "User-Agent": "NestoraDemo/1.0" } });
      if (!resp.ok) throw new Error("Geocoder unavailable");
      const data: any = await resp.json();
      results = (data.features || []).map((f: any) => {
        const pr = f.properties;
        const label = [pr.name, pr.city || pr.district, pr.state].filter(Boolean).join(", ");
        return {
          name: label, full: label + (pr.country ? ", " + pr.country : ""),
          lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], kind: pr.osm_value || "place"
        };
      });
    }
    this.cache.set(key, results);
    return results;
  }
}
