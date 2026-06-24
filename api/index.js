// api/index.js
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { icao, year, month, day } = req.query;
  if (!icao || !year || !month || !day) {
    return res.status(400).json({ error: "Parameter fehlen: icao, year, month, day" });
  }

  const m = parseInt(month);
  const d = parseInt(day);
  const y = parseInt(year);
  const next = new Date(Date.UTC(y, m - 1, d + 1));

  const iemUrl =
    "https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py" +
    "?station=" + icao.toUpperCase() +
    "&data=metar" +
    "&year1=" + y + "&month1=" + m + "&day1=" + d +
    "&year2=" + next.getUTCFullYear() + "&month2=" + (next.getUTCMonth() + 1) + "&day2=" + next.getUTCDate() +
    "&tz=UTC&format=onlycomma&latlon=no&missing=M&trace=T&direct=no&report_type=3,4";

  try {
    const iemRes = await fetch(iemUrl);
    if (!iemRes.ok) throw new Error("IEM returned HTTP " + iemRes.status);
    const text = await iemRes.text();

    const metars = text
      .split("\n")
      .filter(l => {
        const t = l.trim();
        return t && !t.startsWith("station") && !t.startsWith("#") && t.includes(",");
      })
      .map(line => {
        const parts = line.split(",");
        if (parts.length >= 3) return { time: parts[1].trim(), raw: parts[2].trim() };
        return null;
      })
      .filter(Boolean);

    return res.status(200).json({ metars: metars, count: metars.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
