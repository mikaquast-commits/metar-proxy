module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const q = (req.query.q || "").trim().toUpperCase();
  if (q.length < 2) {
    return res.status(400).json({ error: "Mindestens 2 Zeichen" });
  }

  try {
    // OurAirports CSV - free, global, 70k+ airports with IATA + ICAO
    const r = await fetch("https://davidmegginson.github.io/ourairports-data/airports.csv", {
      headers: { "User-Agent": "WairwebElongPosterShop/1.0" },
      signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) throw new Error(`OurAirports HTTP ${r.status}`);
    const csv = await r.text();

    const lines = csv.split("\n");
    const header = lines[0].split(",");

    // Find column indices
    const col = (name) => header.findIndex(h => h.replace(/"/g,'').trim() === name);
    const iIcao     = col("ident");
    const iIata     = col("iata_code");
    const iName     = col("name");
    const iType     = col("type");
    const iLat      = col("latitude_deg");
    const iLon      = col("longitude_deg");
    const iCountry  = col("iso_country");

    const results = [];

    for (let i = 1; i < lines.length && results.length < 10; i++) {
      const row = lines[i].split(",").map(c => c.replace(/^"|"$/g,'').trim());
      if (!row[iIcao]) continue;

      // Only include airports with METAR (large/medium airports + small with ICAO)
      const type = row[iType] || "";
      if (type === "heliport" || type === "seaplane_base" || type === "closed") continue;

      const icao = row[iIcao].toUpperCase();
      const iata = (row[iIata] || "").toUpperCase();
      const name = row[iName] || "";
      const nameUpper = name.toUpperCase();

      // Match against ICAO or name only (no IATA)
      if (
        icao === q ||
        icao.startsWith(q) ||
        nameUpper.includes(q)
      ) {
        // Skip if ICAO is less than 3 chars
        if (icao.length < 3) continue;

        results.push({
          icao: icao,
          iata: iata || null,
          name: name,
          country: row[iCountry] || "",
          lat: parseFloat(row[iLat]) || null,
          lon: parseFloat(row[iLon]) || null,
          archive_begin: "2000",
        });
      }
    }

    return res.status(200).json({ stations: results, count: results.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
