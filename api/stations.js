module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const q = (req.query.q || "").trim();
  if (q.length < 2) {
    return res.status(400).json({ error: "Mindestens 2 Zeichen" });
  }

  try {
    // Try IEM network search - _ASOS searches all global ASOS stations
    const url = `https://mesonet.agron.iastate.edu/sites/locate.php?network=_ASOS&station=${encodeURIComponent(q.toUpperCase())}&fmt=json`;
    
    const r = await fetch(url, {
      headers: { "User-Agent": "WairwebElongPosterShop/1.0" },
      signal: AbortSignal.timeout(10000)
    });

    const text = await r.text();
    
    // Parse whatever IEM returns
    let data;
    try {
      data = JSON.parse(text);
    } catch(e) {
      // IEM returned non-JSON - return empty
      return res.status(200).json({ stations: [], count: 0, debug: text.substring(0, 200) });
    }

    // Handle both array and object responses
    const arr = Array.isArray(data) ? data : (data.features || data.stations || []);
    
    const stations = arr.slice(0, 12).map(s => ({
      icao: s.id || s.stid || s.icao || "",
      name: s.name || s.sname || s.station_name || "",
      country: s.country || s.state || "",
      lat: s.lat || s.latitude || null,
      lon: s.lon || s.longitude || null,
      archive_begin: s.archive_begin ? String(s.archive_begin).substring(0, 4) : "2000",
    })).filter(s => s.icao && s.icao.length >= 3);

    return res.status(200).json({ stations, count: stations.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
