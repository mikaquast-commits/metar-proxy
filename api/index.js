// api/index.js – METAR Proxy + Stations Search
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const path = req.url.split("?")[0];
  const q = req.query;

  // ── /stations – Suche Flughäfen bei IEM ──────────────────────────────────
  if (path === "/stations" || q.action === "stations") {
    const search = (q.q || "").trim();
    if (search.length < 2) {
      return res.status(400).json({ error: "Mindestens 2 Zeichen" });
    }
    try {
      const url = `https://mesonet.agron.iastate.edu/sites/locate.php?station=${encodeURIComponent(search.toUpperCase())}&network=_ASOS&fmt=json`;
      const r = await fetch(url, { headers: { "User-Agent": "WairwebElongPosterShop/1.0" } });
      if (!r.ok) throw new Error(`IEM HTTP ${r.status}`);
      const data = await r.json();
      const stations = (Array.isArray(data) ? data : []).slice(0, 10).map(s => ({
        icao: s.id || s.stid || "",
        name: s.name || "",
        country: s.country || "",
        lat: s.lat || null,
        lon: s.lon || null,
        archive_begin: s.archive_begin ? String(s.archive_begin).substring(0, 4) : null,
      })).filter(s => s.icao && s.icao.length >= 3);
      return res.status(200).json({ stations, count: stations.length });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── /map – Overpass API Proxy ─────────────────────────────────────────────
  if (path === "/map" || (q.lat && q.lon && !q.icao_only)) {
    const { lat, lon } = q;
    if (!lat || !lon) return res.status(400).json({ error: "Parameter fehlen: lat, lon" });
    const radius = 6000;
    const query = `[out:json][timeout:30];(way['aeroway'~'runway|taxiway|apron|terminal|hangar'](around:${radius},${lat},${lon}););out geom;`;
    try {
      const r = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: "data=" + encodeURIComponent(query),
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "WairwebElongPosterShop/1.0" }
      });
      if (!r.ok) throw new Error(`Overpass HTTP ${r.status}`);
      const data = await r.json();
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── /metar – IEM METAR Daten ──────────────────────────────────────────────
  const { icao, year, month, day } = q;
  if (!icao || !year || !month || !day) {
    return res.status(400).json({ error: "Parameter fehlen: icao, year, month, day" });
  }
  const m = parseInt(month), d = parseInt(day), y = parseInt(year);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const iemUrl =
    "https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py" +
    "?station=" + icao.toUpperCase() +
    "&data=metar" +
    "&year1=" + y + "&month1=" + m + "&day1=" + d +
    "&year2=" + next.getUTCFullYear() + "&month2=" + (next.getUTCMonth() + 1) + "&day2=" + next.getUTCDate() +
    "&tz=UTC&format=onlycomma&latlon=no&missing=M&trace=T&direct=no&report_type=3,4";
  try {
    const r = await fetch(iemUrl);
    if (!r.ok) throw new Error("IEM returned HTTP " + r.status);
    const text = await r.text();
    const metars = text.split("\n")
      .filter(l => { const t = l.trim(); return t && !t.startsWith("station") && !t.startsWith("#") && t.includes(","); })
      .map(line => {
        const parts = line.split(",");
        if (parts.length >= 3) return { time: parts[1].trim(), raw: parts[2].trim() };
        return null;
      }).filter(Boolean);
    return res.status(200).json({ metars, count: metars.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
