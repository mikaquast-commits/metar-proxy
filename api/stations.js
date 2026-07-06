module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const q = (req.query.q || "").trim().toUpperCase();
  if (q.length < 2) {
    return res.status(400).json({ error: "Mindestens 2 Zeichen" });
  }

  try {
    // Determine which country/region networks to search based on prefix
    const networks = getNetworks(q);
    
    const allStations = [];
    
    for (const network of networks) {
      try {
        const url = `https://mesonet.agron.iastate.edu/geojson/network.py?network=${network}`;
        const r = await fetch(url, {
          headers: { "User-Agent": "WairwebElongPosterShop/1.0" },
          signal: AbortSignal.timeout(8000)
        });
        if (!r.ok) continue;
        const data = await r.json();
        const features = data.features || [];
        
        const matches = features.filter(f => {
          const props = f.properties || {};
          const id = (props.sid || "").toUpperCase();
          const name = (props.sname || "").toUpperCase();
          return id.includes(q) || name.includes(q);
        }).map(f => {
          const props = f.properties || {};
          const coords = f.geometry && f.geometry.coordinates;
          return {
            icao: props.sid || "",
            name: props.sname || "",
            country: props.country || network.split("_")[0] || "",
            lat: coords ? coords[1] : null,
            lon: coords ? coords[0] : null,
            archive_begin: props.archive_begin ? String(props.archive_begin).substring(0, 4) : "2000",
          };
        }).filter(s => s.icao.length >= 3);
        
        allStations.push(...matches);
        if (allStations.length >= 10) break;
      } catch(e) { continue; }
    }

    // Deduplicate by ICAO
    const seen = new Set();
    const unique = allStations.filter(s => {
      if (seen.has(s.icao)) return false;
      seen.add(s.icao);
      return true;
    }).slice(0, 10);

    return res.status(200).json({ stations: unique, count: unique.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

function getNetworks(q) {
  // Map ICAO prefixes to IEM network codes
  const prefix = q.substring(0, 2);
  const networkMap = {
    "ED": ["DE__ASOS"],  // Germany
    "ET": ["DE__ASOS"],  // Germany military
    "LO": ["AT__ASOS"],  // Austria
    "LS": ["CH__ASOS"],  // Switzerland
    "LF": ["FR__ASOS"],  // France
    "EG": ["GB__ASOS"],  // UK
    "EH": ["NL__ASOS"],  // Netherlands
    "LE": ["ES__ASOS"],  // Spain
    "LI": ["IT__ASOS"],  // Italy
    "EP": ["PL__ASOS"],  // Poland
    "EK": ["DK__ASOS"],  // Denmark
    "EN": ["NO__ASOS"],  // Norway
    "ES": ["SE__ASOS"],  // Sweden
    "EF": ["FI__ASOS"],  // Finland
    "KJ": ["_US_ASOS"], // USA
    "KL": ["_US_ASOS"],
    "KO": ["_US_ASOS"],
    "KS": ["_US_ASOS"],
    "KA": ["_US_ASOS"],
    "KB": ["_US_ASOS"],
    "KC": ["_US_ASOS"],
    "KD": ["_US_ASOS"],
    "KE": ["_US_ASOS"],
    "KF": ["_US_ASOS"],
    "KG": ["_US_ASOS"],
    "KH": ["_US_ASOS"],
    "KI": ["_US_ASOS"],
    "KM": ["_US_ASOS"],
    "KN": ["_US_ASOS"],
    "KP": ["_US_ASOS"],
    "KR": ["_US_ASOS"],
    "KT": ["_US_ASOS"],
    "KU": ["_US_ASOS"],
    "KV": ["_US_ASOS"],
    "KW": ["_US_ASOS"],
    "KX": ["_US_ASOS"],
    "KY": ["_US_ASOS"],
    "KZ": ["_US_ASOS"],
  };
  
  // If we have a prefix match, use it
  if (networkMap[prefix]) return networkMap[prefix];
  
  // Otherwise search common networks
  return ["DE__ASOS", "AT__ASOS", "CH__ASOS", "FR__ASOS", "GB__ASOS", 
          "NL__ASOS", "ES__ASOS", "IT__ASOS", "PL__ASOS"];
}
