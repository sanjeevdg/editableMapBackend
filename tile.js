#!/usr/bin/env node
// tile.js
// Usage: node tile.js <lon> <lat> <zoom> [baseUrl]

const lon = parseFloat(process.argv[2]);
const lat = parseFloat(process.argv[3]);
const zoom = parseInt(process.argv[4], 10) || 6;
const baseUrl = process.argv[5] || "http://localhost:3001/tiles";

if (isNaN(lon) || isNaN(lat)) {
  console.error("Usage: node tile.js <lon> <lat> <zoom> [baseUrl]");
  process.exit(1);
}

function lonLatToTile(lon, lat, zoom) {
  const x = Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
  const y = Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) +
      1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );
  return { z: zoom, x, y };
}

const { z, x, y } = lonLatToTile(lon, lat, zoom);

console.log(`${baseUrl}/${z}/${x}/${y}.pbf`);

