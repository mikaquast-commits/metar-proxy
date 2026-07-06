// api/stations.js – Suche IEM Stationen weltweit
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { q } = req.query;
  if (!q || q.length < 2) {
    return res.status(400).json({ error: "Mindestens 2 Zeichen erforderlich" });
  }

  const query = q.trim().toUpperCase();

  try {
    // IEM station search API - searches by ICAO or name
    const url = `https://mesonet.agron.iastate.edu/sites/locate.php?station=${encodeURIComponent(query)}&network=_ASOS&fmt=json`;
    const r = await fetch(url, {
      headers: { "User-Agent": "WairwebElongPosterShop/1.0" }
    });

    if (!r.ok) throw new Error(`IEM HTTP ${r.status}`);
    const data = await r.json();

    // data is array of station objects
    const stations = (data || []).slice(0, 10).map(s => ({
      icao: s.id || s.stid || "",
      name: s.name || s.sname || "",
      country: s.country || "",
      lat: s.lat || null,
      lon: s.lon || null,
      archive_begin: s.archive_begin ? s.archive_begin.substring(0, 4) : null,
    })).filter(s => s.icao);

    return res.status(200).json({ stations, count: stations.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
