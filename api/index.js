// =============================================================================
// api/index.js
// PURPOSE: Vercel serverless backend – proxies IEM ASOS and Overpass API.
//          Routes: /metar, /map
//          Handles all validation, error mapping and timeouts.
// =============================================================================

// =============================================================================
// CONFIGURATION
// =============================================================================
var CONFIG = {
  IEM_BASE:      "https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py",
  OVERPASS_BASE: "https://overpass-api.de/api/interpreter",
  MAP_RADIUS:    6000,
  TIMEOUT_MS:    20000,
  USER_AGENT:    "WairwebElongPosterShop/2.0",
};

// =============================================================================
// ERROR RESPONSES
// =============================================================================
var ERRORS = {
  MISSING_PARAMS:    { code: "MISSING_PARAMS",    message: "Fehlende Parameter." },
  INVALID_ICAO:      { code: "INVALID_ICAO",      message: "Ungültiger ICAO-Code. Erlaubt: 3-4 Buchstaben." },
  INVALID_DATE:      { code: "INVALID_DATE",       message: "Ungültiges Datum." },
  FUTURE_DATE:       { code: "FUTURE_DATE",        message: "Zukünftige Daten sind nicht verfügbar." },
  INVALID_COORDS:    { code: "INVALID_COORDS",     message: "Ungültige Koordinaten." },
  NO_DATA:           { code: "NO_DATA",            message: "Keine Daten für diesen Zeitraum verfügbar." },
  IEM_ERROR:         { code: "IEM_ERROR",          message: "Fehler beim Abrufen der Wetterdaten." },
  OVERPASS_ERROR:    { code: "OVERPASS_ERROR",     message: "Kartendaten vorübergehend nicht verfügbar." },
  TIMEOUT:           { code: "TIMEOUT",            message: "Zeitüberschreitung. Bitte erneut versuchen." },
  UNKNOWN:           { code: "UNKNOWN",            message: "Unbekannter Fehler. Bitte erneut versuchen." },
};

function sendError(res, status, error) {
  return res.status(status).json({ success: false, code: error.code, message: error.message });
}

// =============================================================================
// FETCH WITH TIMEOUT
// =============================================================================
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || CONFIG.TIMEOUT_MS);
  try {
    const r = await fetch(url, Object.assign({ signal: controller.signal }, options || {}));
    clearTimeout(timer);
    return r;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") throw { isTimeout: true };
    throw err;
  }
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================
function isValidICAO(code) {
  return typeof code === "string" && /^[A-Z]{3,4}$/.test(code.trim().toUpperCase());
}

function isValidCoord(val) {
  var n = parseFloat(val);
  return !isNaN(n) && isFinite(n);
}

function isFutureDate(year, month, day) {
  var d = new Date(Date.UTC(+year, +month - 1, +day));
  return d > new Date();
}

// =============================================================================
// HANDLER
// =============================================================================
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  var path = (req.url || "").split("?")[0];
  var q    = req.query || {};

  // ── /map ───────────────────────────────────────────────────────────────────
  if (path === "/map") {
    if (!q.lat || !q.lon) return sendError(res, 400, ERRORS.MISSING_PARAMS);
    if (!isValidCoord(q.lat) || !isValidCoord(q.lon)) return sendError(res, 400, ERRORS.INVALID_COORDS);

    var lat = parseFloat(q.lat), lon = parseFloat(q.lon);
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return sendError(res, 400, ERRORS.INVALID_COORDS);

    var overpassQuery =
      "[out:json][timeout:25];"+
      "(way['aeroway'~'runway|taxiway|apron|terminal|hangar']"+
      "(around:"+CONFIG.MAP_RADIUS+","+lat+","+lon+"););out geom;";

    try {
      var r = await fetchWithTimeout(CONFIG.OVERPASS_BASE, {
        method:  "POST",
        body:    "data=" + encodeURIComponent(overpassQuery),
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": CONFIG.USER_AGENT },
      });
      if (!r.ok) return sendError(res, 502, ERRORS.OVERPASS_ERROR);
      var data = await r.json();
      return res.status(200).json(data);
    } catch (err) {
      if (err.isTimeout) return sendError(res, 504, ERRORS.TIMEOUT);
      return sendError(res, 502, ERRORS.OVERPASS_ERROR);
    }
  }

  // ── /metar ─────────────────────────────────────────────────────────────────
  var { icao, year, month, day } = q;

  // Validate parameters
  if (!icao || !year || !month || !day) return sendError(res, 400, ERRORS.MISSING_PARAMS);

  icao = icao.trim().toUpperCase();
  if (!isValidICAO(icao)) return sendError(res, 400, ERRORS.INVALID_ICAO);

  var y = parseInt(year), m = parseInt(month), d = parseInt(day);
  if (isNaN(y) || isNaN(m) || isNaN(d) || m < 1 || m > 12 || d < 1 || d > 31) {
    return sendError(res, 400, ERRORS.INVALID_DATE);
  }
  if (isFutureDate(y, m, d)) return sendError(res, 400, ERRORS.FUTURE_DATE);

  var next = new Date(Date.UTC(y, m - 1, d + 1));
  var iemUrl =
    CONFIG.IEM_BASE +
    "?station=" + icao +
    "&data=metar" +
    "&year1=" + y  + "&month1=" + m  + "&day1=" + d +
    "&year2=" + next.getUTCFullYear() + "&month2=" + (next.getUTCMonth()+1) + "&day2=" + next.getUTCDate() +
    "&tz=UTC&format=onlycomma&latlon=no&missing=M&trace=T&direct=no&report_type=3,4";

  try {
    var r2 = await fetchWithTimeout(iemUrl, {
      headers: { "User-Agent": CONFIG.USER_AGENT }
    });
    if (!r2.ok) return sendError(res, 502, ERRORS.IEM_ERROR);
    var text = await r2.text();

    var metars = text.split("\n")
      .filter(function(l) {
        var t = l.trim();
        return t && !t.startsWith("station") && !t.startsWith("#") && t.includes(",");
      })
      .map(function(line) {
        var parts = line.split(",");
        if (parts.length >= 3) return { time: parts[1].trim(), raw: parts[2].trim() };
        return null;
      })
      .filter(Boolean);

    if (!metars.length) return sendError(res, 404, ERRORS.NO_DATA);

    return res.status(200).json({ success: true, metars: metars, count: metars.length });
  } catch (err) {
    if (err.isTimeout) return sendError(res, 504, ERRORS.TIMEOUT);
    return sendError(res, 502, ERRORS.IEM_ERROR);
  }
};
