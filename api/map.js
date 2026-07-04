// api/map.js – Overpass API Proxy (vermeidet CORS)
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { icao, lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: "Parameter fehlen: lat, lon" });
  }

  const radius = 6000;
  const query = `[out:json][timeout:30];(way['aeroway'~'runway|taxiway|apron|terminal|hangar'](around:${radius},${lat},${lon}););out geom;`;

  try {
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: "data=" + encodeURIComponent(query),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "WairwebElongPosterShop/1.0"
      }
    });
    if (!r.ok) throw new Error(`Overpass HTTP ${r.status}`);
    const data = await r.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
