const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.set('port', (process.env.PORT || 5000));


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
console.log('featuresposting',features);
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


app.get("/tiles/:z/:x/:y.pbf", async (req, res) => {
  const z = Number(req.params.z);
  const x = Number(req.params.x);
  const y = Number(req.params.y);

  const maxXY = 2 ** z - 1;

  if (
    isNaN(z) || isNaN(x) || isNaN(y) ||
    x < 0 || x > maxXY || y < 0 || y > maxXY
  ) {
    return res.status(400).send("Invalid tile coordinates");
  }

  const sql = `
    WITH mvtgeom AS (
      SELECT ST_AsMVTGeom(
        geom,
        ST_TileEnvelope($1, $2, $3)
      ) AS geom, geojson
      FROM features
      WHERE geom && ST_TileEnvelope($1, $2, $3)
    )
    SELECT ST_AsMVT(mvtgeom.*, 'features') AS tile
    FROM mvtgeom;
  `;

  try {
    const result = await pool.query(sql, [z, x, y]);
    res.setHeader("Content-Type", "application/x-protobuf");
    res.send(result.rows[0].tile || Buffer.alloc(0));
  } catch (err) {
    console.error(err);
    res.status(500).send("Tile generation error");
  }
});

app.get('/', (req, res) => {
  res.send('Hello World!')
});


app.listen(app.get('port'), function() {
    console.log('App is running, server is listening on port ', app.get('port'));
});





