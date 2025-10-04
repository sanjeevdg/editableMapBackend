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

app.put("/api/features/:id", async (req, res) => {
  const { id } = req.params;
  const { properties } = req.body; // new properties object (key/value pairs)

console.log('req.params',req.params);
console.log('req.body',req.body);


  try {
    await pool.query(
      `
      UPDATE features
      SET geojson = jsonb_set(
        geojson,
        '{properties}',   -- target JSON path inside geojson
        $1::jsonb,        -- replace with new properties object
        true              -- create if not exists
      )
      WHERE id = $2
      `,
      [JSON.stringify(properties), id]
    );
console.log('put success!');
    res.json({ success: true });
  } catch (err) {
    console.error("Error updating properties:", err);
    res.status(500).json({ error: "DB update failed" });
  }
});


/*
app.post("/api/features", async (req, res) => {
  const features = req.body.features; // array of features from frontend

console.log('feaurgthes-len',features.length);

  try {
    for (const f of features) {
      // Build a clean GeoJSON feature
      const cleanFeature = {
        type: "Feature",
        geometry: f.geometry,
        properties: f.properties || {},
      };
    if (f.id) {
        // Existing feature → update
        await pool.query(
          "UPDATE features SET geom = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), geojson = $2 WHERE id = $3",
          [JSON.stringify(f.geometry), cleanFeature, f.id]
        ); console.log('updated');
      } else {
        // New feature → insert
        const result = await pool.query(
          "INSERT INTO features (geom, geojson) VALUES (ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), $2) RETURNING id",
          [JSON.stringify(f.geometry), cleanFeature]
        );console.log('inserted');
        f.id = result.rows[0].id; // Assign ID back to frontend if needed
      }

    }

    res.send({ status: "ok" });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "DB error" });
  }
});
*/

app.post("/api/features", async (req, res) => {
  const features = req.body.features;
console.log('featuresfrom request',features);

 // expect Feature[]
  try {
    await pool.query("TRUNCATE features");
    for (const f of features) {

console.log('iterating-features',f);

      await pool.query(
        "INSERT INTO features (geom, geojson) VALUES (ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), $2)",
  [JSON.stringify(f.geometry), {
  type: "Feature",
  geometry: f.geometry,
  properties: f.properties || {},
}]
      );
    }
    res.send({ status: "ok" });
  } catch (err) {
    console.error("Error saving features:", err);
    res.status(500).send({ error: "DB error" });
  }
});

app.post("/react/api/features/", async (req, res) => {
  const features = req.body;
console.log('featuresfrom request',req.body);

 // expect Feature[]
  try {
//    await pool.query("TRUNCATE features");
  //  for (const f of features) {

console.log('iterating-features',req.body);

      await pool.query(
        "INSERT INTO features (geom, geojson) VALUES (ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), $2)",
  [JSON.stringify(features.geometry), {
  type: "Feature",
  geometry: features.geometry,
  properties: features.properties || {},
}]
      );
  //  }
    res.send({ status: "ok" });
  } catch (err) {
    console.error("Error saving features:", err);
    res.status(500).send({ error: "DB error" });
  }
});


/*s
app.post("/api/ffeatures", async (req, res) => {
  const features = req.body.features;
//console.log('featuresposting',features);
  try {
    await pool.query("TRUNCATE features");
    for (const f of features) {
      await pool.query(
        "update features set geom=ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), geojson=$2 where features.geojson.id=",
        [JSON.stringify(f.geometry), f]
      );
    }
    res.send({ status: "ok" });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "DB error" });
  }
});
*/



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
*/

app.delete("/api/features/:id", async (req, res) => {
  const { id } = req.params;

console.log('deleterequestparam==',req.params);

  try {
    await pool.query("DELETE FROM features WHERE id = $1", [id]);
    res.send({ status: "ok" });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "DB delete error" });
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

console.log('myrows============',rows);

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
    const result = await pool.query("SELECT id, geom, geojson FROM features");

    // Normalize each row into a standard GeoJSON Feature
    const features = result.rows.map((row) => {
      const geojson = row.geojson || {};

      return {
        type: "Feature",
        id: row.id,
        geometry: geojson.geometry || null,
        properties: geojson.properties || {}, // ✅ normalize here
      };
    });

//console.log('returning features via get request==',features);
    res.json({
      type: "FeatureCollection",
      features,
    });
  } catch (err) {
    console.error("Error fetching features:", err);
    res.status(500).json({ error: "DB fetch failed" });
  }
});


/*
app.get("/api/features", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, ST_AsGeoJSON(geom) AS geometry, geojson
       FROM features`
    );

    const features = rows.map((row) => ({
      type: "Feature",
      id: row.id,
      geometry: JSON.parse(row.geometry),
      properties: row.geojson || {},
    }));

    res.json({
      type: "FeatureCollection",
      features,
    });
  } catch (err) {
    console.error("Error fetching features:", err);
    res.status(500).send({ error: "DB error" });
  }
});




app.get("/api/features", async (req, res) => {

console.log('entering get method...');

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
console.log('exiting get method...');
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});
*/
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





