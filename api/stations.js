module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const q = (req.query.q || "").trim().toUpperCase();
  if (q.length < 2) {
    return res.status(400).json({ error: "Mindestens 2 Zeichen" });
  }

  try {
    const r = await fetch("https://davidmegginson.github.io/ourairports-data/airports.csv", {
      headers: { "User-Agent": "WairwebElongPosterShop/1.0" },
      signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) throw new Error(`OurAirports HTTP ${r.status}`);
    const csv = await r.text();
    const lines = csv.split("\n");

    // Parse CSV header properly
    function parseCSVLine(line) {
      const result = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          result.push(current);
          current = "";
        } else {
          current += ch;
        }
      }
      result.push(current);
      return result;
    }

    const header = parseCSVLine(lines[0]);
    const col = (name) => header.findIndex(h => h.trim() === name);

    const iIcao    = col("ident");
    const iName    = col("name");
    const iType    = col("type");
    const iLat     = col("latitude_deg");
    const iLon     = col("longitude_deg");
    const iCountry = col("iso_country");
    const iElev    = col("elevation_ft");
    const iIata    = col("iata_code");

    const results = [];

    for (let i = 1; i < lines.length && results.length < 10; i++) {
      if (!lines[i].trim()) continue;
      const row = parseCSVLine(lines[i]);

      const type = row[iType] || "";
      if (type === "heliport" || type === "seaplane_base" || type === "closed") continue;
      if (type === "small_airport") continue;
      // Nur Flughäfen mit IATA-Code = garantiert kommerzieller Verkehr
      const iataCheck = (row[iIata] || "").trim();
      if (!iataCheck) continue;

      const icao = (row[iIcao] || "").trim().toUpperCase();
      const name = (row[iName] || "").trim();
      const nameUpper = name.toUpperCase();

      if (icao.length < 3) continue;

      if (icao === q || icao.startsWith(q) || nameUpper.includes(q)) {
        const lat = parseFloat(row[iLat]);
        const lon = parseFloat(row[iLon]);
        results.push({
          icao,
          iata: (row[iIata] || "").trim().toUpperCase() || null,
          name,
          country: (row[iCountry] || "").trim(),
          lat: isNaN(lat) ? null : lat,
          lon: isNaN(lon) ? null : lon,
          elev_ft: row[iElev] ? parseInt(row[iElev]) : null,
          archive_begin: "1929",
        });
      }
    }

    return res.status(200).json({ stations: results, count: results.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
