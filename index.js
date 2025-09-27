const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { Pool } = require("pg");
const zlib = require('zlib');
//import zlib from "zlib";

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.set('port', (process.env.PORT || 3001));


// PostgreSQL connection (enable SSL if required)
const pool = new Pool({
  user: "sanjeev.dasgupta",
  host: "ep-solitary-meadow-593229-pooler.ap-southeast-1.aws.neon.tech",
  database: "postgisdb",
  password: "O2iAgXxL6dcu",
  port: 5432,
ssl: {
    rejectUnauthorized: false, // allow self-signed certificates
  }
});

// Ensure table exists
pool.query(`
  CREATE TABLE IF NOT EXISTS features (
    id SERIAL PRIMARY KEY,
    geom geometry,
    geojson JSONB
  )
`);


// Save features (replace existing)
app.post("/api/features", async (req, res) => {
  const features = req.body.features;
//console.log('featuresposting',features);
  try {
    await pool.query("TRUNCATE features");
    for (const f of features) {
      await pool.query(
        "INSERT INTO features (geom, geojson) VALUES (ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), $2)",
        [JSON.stringify(f.geometry), f]
      );
    }
    res.send({ status: "ok" });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "DB error" });
  }
});

/*
// Get features
app.get("/api/features", async (req, res) => {
  try {
    const result = await pool.query("SELECT geojson FROM features");
    res.send(result.rows.map((r) => r.geojson));
console.log('featuresgetting',result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "DB error" });
  }
});
*/

app.delete("/features/:id", async (req, res) => {
  const id = req.params.id;

console.log('IDRETURNED=='+id);

  if (!id) return res.status(400).json({ error: "Missing id" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const q = `DELETE FROM features WHERE id = $1 RETURNING id`;
    const result = await client.query(q, [id]);

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Feature not found" });
    }

    await client.query("COMMIT");
    return res.json({ success: true, deletedId: result.rows[0].id });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Delete feature error:", err);
    return res.status(500).json({ success: false, error: "DB error" });
  } finally {
    client.release();
  }
});


app.post("/save-geojson", express.json(), async (req, res) => {
  const geojson = req.body;

  try {
    for (const feature of geojson.features) {
      const geom = JSON.stringify(feature.geometry);


/*
        `INSERT INTO features (geom, geojson) 
         VALUES (ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), $2::jsonb)`
,        [geom, feature.properties || {}]

*/
      await pool.query(
"INSERT INTO features (geom, geojson) VALUES (ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), $2)",
        [JSON.stringify(f.geometry), f]

      );
    }
    res.send({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error saving GeoJSON");
  }
});


app.get("/xtiles/:z/:x/:y.pbf", async (req, res) => {
  const { z, x, y } = req.params;
  console.log("Tile request →", z, x, y); // should log integers

  try {
    const sql = `
      WITH bounds AS (
        SELECT ST_TileEnvelope($1, $2, $3) AS tile_geom
      ),
      mvtgeom AS (
        SELECT
          id,
          ST_AsMVTGeom(ST_Transform(geom, 3857), tile_geom, 4096, 256, true) AS mvt_geom,
          *
        FROM features, bounds
        WHERE ST_Intersects(ST_Transform(geom, 3857), tile_geom)
      )
      SELECT ST_AsMVT(mvtgeom, 'default', 4096, 'mvt_geom') AS mvt
      FROM mvtgeom;
    `;

    const { rows } = await pool.query(sql, [z, x, y]);

    if (!rows[0] || !rows[0].mvt) {
      res.status(204).send();
      return;
    }

    const compressed = zlib.gzipSync(rows[0].mvt);

    res.setHeader("Content-Type", "application/x-protobuf");
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(compressed);

  } catch (err) {
    console.error("Tile error:", err);
    res.status(500).send("Tile generation error");
  }
});

app.get("/mtiles/:z/:x/:y.pbf", async (req, res) => {
  try {
    const { z, x, y } = req.params;

console.log('z='+ z + 'x=' + x + 'y=' + y);

    const sql = `
      WITH bounds AS (
  SELECT ST_TileEnvelope($1, $2, $3) AS tile_geom
),
mvtgeom AS (
  SELECT
    g.id,
    ST_AsMVTGeom(
      ST_Transform(g.geom, 3857),
      b.tile_geom,
      4096,
      256,
      true
    ) AS mvt_geom,
    g.*
  FROM features g
  JOIN bounds b
    ON ST_Intersects(ST_Transform(g.geom, 3857), b.tile_geom)
),
points AS (
  SELECT ST_AsMVT(mvtgeom, 'points', 4096, 'mvt_geom')
  FROM mvtgeom WHERE GeometryType(mvt_geom) = 'POINT'
),
lines AS (
  SELECT ST_AsMVT(mvtgeom, 'lines', 4096, 'mvt_geom')
  FROM mvtgeom WHERE GeometryType(mvt_geom) LIKE 'LINESTRING%'
),
polygons AS (
  SELECT ST_AsMVT(mvtgeom, 'polygons', 4096, 'mvt_geom')
  FROM mvtgeom WHERE GeometryType(mvt_geom) LIKE 'POLYGON%'
)
SELECT
  (SELECT * FROM points) ||
  (SELECT * FROM lines) ||
  (SELECT * FROM polygons) AS mvt;

    `;

    const { rows } = await pool.query(sql, [z, x, y]);

    if (!rows[0].mvt) {
      res.status(204).send(); // no content
      return;
    }

    const compressed = zlib.gzipSync(rows[0].mvt);

    res.setHeader("Content-Type", "application/x-protobuf");
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(compressed);

  } catch (err) {
    console.error("Tile error:", err);
    res.status(500).send("Tile generation error");
  }
});


app.get("/api/features", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT jsonb_build_object(
          'type', 'Feature',
          'id', id,
          'geometry', ST_AsGeoJSON(geom)::jsonb,
          'geojson', geojson
        ) AS feature
       FROM features`
    );

    const features = result.rows.map(r => r.feature);

    res.json({
      type: "FeatureCollection",
      features
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

/*
app.get("/tiles/:z/:x/:y.pbf", async (req, res) => {
  const { z, x, y } = req.params;

  try {
    const result = await pool.query(
      `
      WITH bounds AS (
        SELECT ST_TileEnvelope($1, $2, $3) AS geom
      )
      SELECT ST_AsMVT(tile, 'mylayer', 4096, 'mvtgeom') AS mvt
      FROM (
        SELECT
          id,
          ST_AsMVTGeom(
            ST_Transform(t.geom, 3857),
            bounds.geom,
            4096,
            256,
            true
          ) AS mvtgeom
        FROM features t
        JOIN bounds
          ON ST_Intersects(ST_Transform(t.geom, 3857), bounds.geom)
      ) AS tile;
      `,
      [z, x, y]
    );

    if (!result.rows[0]?.mvt) {
      res.status(204).send();
    } else {
      res.setHeader("Content-Type", "application/x-protobuf");
      res.send(result.rows[0].mvt);
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Tile generation error");
  }
});
*/


/*
 WITH bounds AS (
  -- TileEnvelope always gives WebMercator (EPSG:3857)
  SELECT ST_TileEnvelope($1, $2, $3) AS geom
),
mvtgeom AS (
  SELECT id,
         ST_AsMVTGeom(
           ST_Transform(t.geom, 3857),  -- transform from EPSG:4326 to 3857
           b.geom,
           4096,
           256,
           true
         ) AS geom
  FROM features t, bounds b
  WHERE ST_Intersects(ST_Transform(t.geom, 3857), b.geom)
)
SELECT ST_AsMVT(mvtgeom, 'features', 4096, 'geom') AS tile
FROM mvtgeom;

*/



// Route: /tiles/:z/:x/:y.pbf
app.get("/tiles/:z/:x/:y.pbf", async (req, res) => {
  const { z, x, y } = req.params;

  const sql = `
   WITH bounds AS (
  SELECT ST_TileEnvelope($1, $2, $3) AS geom
),
points AS (
  SELECT id,
         ST_AsMVTGeom(
           ST_Transform(f.geom, 3857),
           bounds.geom,
           4096,
           256,
           true
         ) AS geom
  FROM features f, bounds
  WHERE GeometryType(f.geom) IN ('POINT','MULTIPOINT')
    AND ST_Intersects(ST_Transform(f.geom, 3857), bounds.geom)
),
lines AS (
  SELECT id,
         ST_AsMVTGeom(
           ST_Transform(f.geom, 3857),
           bounds.geom,
           4096,
           256,
           true
         ) AS geom
  FROM features f, bounds
  WHERE GeometryType(f.geom) IN ('LINESTRING','MULTILINESTRING')
    AND ST_Intersects(ST_Transform(f.geom, 3857), bounds.geom)
),
polygons AS (
  SELECT id,
         ST_AsMVTGeom(
           ST_Transform(f.geom, 3857),
           bounds.geom,
           4096,
           256,
           true
         ) AS geom
  FROM features f, bounds
  WHERE GeometryType(f.geom) IN ('POLYGON','MULTIPOLYGON')
    AND ST_Intersects(ST_Transform(f.geom, 3857), bounds.geom)
),
mvt AS (
  SELECT ST_AsMVT(points, 'my_points', 4096, 'geom') AS tile FROM points
  UNION ALL
  SELECT ST_AsMVT(lines, 'my_lines', 4096, 'geom') FROM lines
  UNION ALL
  SELECT ST_AsMVT(polygons, 'my_polygons', 4096, 'geom') FROM polygons
)
SELECT string_agg(tile, '' ORDER BY tile) AS tile
FROM mvt;
  `;



  try {
    const result = await pool.query(sql, [z, x, y]);
    const tile = result.rows[0].tile;

    if (tile) {
      res.setHeader("Content-Type", "application/vnd.mapbox-vector-tile");
//res.setHeader("Content-Type", "application/x-protobuf");
//res.setHeader("Content-Encoding", "gzip"); // if gzipped
//res.setHeader("Access-Control-Allow-Origin", "*");

      res.send(tile);
    } else {
      res.status(204).send(); // No content for empty tile
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Error generating vector tile");
  }
});
/*
app.get('/tiles/:z/:x/:y.pbf', async (req, res) => {
   const { z, x, y } = req.params;

  try {
    const result = await pool.query(
      `WITH bounds AS (
  SELECT ST_TileEnvelope($1, $2, $3) AS geom
),
mvtgeom AS (
  SELECT 
    ST_AsMVTGeom(t.geom, bounds.geom) AS geom,
    t.id
  FROM features t, bounds
  WHERE t.geom && bounds.geom
)
SELECT ST_AsMVT(mvtgeom, 'features', 4096, 'geom') AS mvt
FROM mvtgeom;
      `,
      [z, x, y]
    );

    const tile = result.rows[0].mvt;
    if (!tile) {
      res.status(204).send(); // empty tile
      return;
    }

    res.setHeader('Content-Type', 'application/x-protobuf');
    res.send(tile);
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});
*/
app.get('/', (req, res) => {
  res.send('Hello World!')
});


app.listen(app.get('port'), function() {
    console.log('App is running, server is listening on port ', app.get('port'));
});





