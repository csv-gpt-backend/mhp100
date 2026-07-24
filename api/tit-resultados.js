const { sql } = require("@vercel/postgres");

function norm(v) {
  return String(v ?? "").trim();
}

function fold(v) {
  return norm(v)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function readBody(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === "string") {
    try {
      return JSON.parse(b);
    } catch {
      return {};
    }
  }
  return b;
}

function clientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (xf) {
    const first = String(xf).split(",")[0].trim();
    if (first) return first;
  }
  const real = norm(req.headers["x-real-ip"]);
  if (real) return real;
  const vercel = norm(req.headers["x-vercel-forwarded-for"]);
  if (vercel) return String(vercel).split(",")[0].trim();
  return "";
}

function isPrivateIp(ip) {
  const s = String(ip || "");
  if (!s || s === "::1" || s === "127.0.0.1") return true;
  if (s.startsWith("10.") || s.startsWith("192.168.") || s.startsWith("127.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(s)) return true;
  if (s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe80")) return true;
  return false;
}

function headerDecoded(req, name) {
  const raw = req.headers[name];
  if (raw == null || raw === "") return null;
  try {
    return decodeURIComponent(String(raw));
  } catch {
    return String(raw);
  }
}

function fetchJson(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, {
    signal: ctrl.signal,
    headers: { Accept: "application/json" }
  })
    .then(async (r) => {
      clearTimeout(t);
      if (!r.ok) return null;
      return r.json();
    })
    .catch(() => {
      clearTimeout(t);
      return null;
    });
}

function majorityLabel(values) {
  const map = new Map();
  for (const v of values) {
    const label = norm(v);
    if (!label) continue;
    const k = fold(label);
    const cur = map.get(k) || { n: 0, label };
    cur.n += 1;
    map.set(k, cur);
  }
  let best = null;
  for (const cur of map.values()) {
    if (!best || cur.n > best.n) best = cur;
  }
  return best;
}

function uniqueLabels(values) {
  const out = [];
  const seen = new Set();
  for (const v of values) {
    const label = norm(v);
    if (!label) continue;
    const k = fold(label);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(label);
  }
  return out;
}

async function lookupGeo(ip, req) {
  const empty = {
    client_ip: ip || null,
    geo_city: null,
    geo_region: null,
    geo_country: null,
    geo_country_code: null,
    geo_isp: null,
    geo_confidence: null,
    geo_lat: null,
    geo_lon: null,
    geo_sources: []
  };
  if (!ip || isPrivateIp(ip)) return empty;

  const sources = [];

  const vCity = headerDecoded(req, "x-vercel-ip-city");
  const vRegion = headerDecoded(req, "x-vercel-ip-country-region");
  const vCountry = headerDecoded(req, "x-vercel-ip-country");
  const vLat = Number(headerDecoded(req, "x-vercel-ip-latitude"));
  const vLon = Number(headerDecoded(req, "x-vercel-ip-longitude"));
  if (vCity || vRegion || vCountry) {
    sources.push({
      src: "vercel",
      city: norm(vCity) || null,
      region: norm(vRegion) || null,
      country: null,
      country_code: norm(vCountry).toUpperCase() || null,
      lat: Number.isFinite(vLat) ? vLat : null,
      lon: Number.isFinite(vLon) ? vLon : null,
      isp: null
    });
  }

  const [who, api] = await Promise.all([
    fetchJson("https://ipwho.is/" + encodeURIComponent(ip), 3500),
    fetchJson(
      "http://ip-api.com/json/" +
        encodeURIComponent(ip) +
        "?fields=status,message,country,countryCode,regionName,city,lat,lon,isp,org,query",
      3500
    )
  ]);

  if (who && who.success !== false) {
    sources.push({
      src: "ipwho",
      city: norm(who.city) || null,
      region: norm(who.region) || null,
      country: norm(who.country) || null,
      country_code: norm(who.country_code).toUpperCase() || null,
      lat: Number.isFinite(Number(who.latitude)) ? Number(who.latitude) : null,
      lon: Number.isFinite(Number(who.longitude)) ? Number(who.longitude) : null,
      isp:
        norm((who.connection && (who.connection.isp || who.connection.org)) || "") ||
        null
    });
  }

  if (api && api.status === "success") {
    sources.push({
      src: "ip-api",
      city: norm(api.city) || null,
      region: norm(api.regionName) || null,
      country: norm(api.country) || null,
      country_code: norm(api.countryCode).toUpperCase() || null,
      lat: Number.isFinite(Number(api.lat)) ? Number(api.lat) : null,
      lon: Number.isFinite(Number(api.lon)) ? Number(api.lon) : null,
      isp: norm(api.isp || api.org) || null
    });
  }

  if (!sources.length) {
    return { ...empty, client_ip: ip };
  }

  const cityMaj = majorityLabel(sources.map((s) => s.city));
  const regionMaj = majorityLabel(sources.map((s) => s.region));
  const codeMaj = majorityLabel(sources.map((s) => s.country_code));
  const countryMaj = majorityLabel(sources.map((s) => s.country));
  const ispMaj = majorityLabel(sources.map((s) => s.isp));

  let confidence = "baja";
  let geo_city = null;
  let geo_region = regionMaj ? regionMaj.label : null;

  if (cityMaj && cityMaj.n >= 2) {
    confidence = "alta";
    geo_city = cityMaj.label;
  } else if (regionMaj && regionMaj.n >= 2) {
    confidence = "media";
    geo_city = cityMaj && cityMaj.n === 1 ? null : cityMaj ? cityMaj.label : null;
    // Si hay ciudades distintas, no afirmar una sola ciudad
    if (uniqueLabels(sources.map((s) => s.city)).length > 1) {
      geo_city = null;
    } else if (cityMaj) {
      geo_city = cityMaj.label;
    }
  } else if (cityMaj) {
    confidence = "baja";
    geo_city = null; // una sola fuente: no afirmar ciudad
  }

  // Coordenadas: promedio de fuentes que coinciden en ciudad/región elegida
  const coordSrc = sources.filter((s) => {
    if (s.lat == null || s.lon == null) return false;
    if (geo_city) return fold(s.city) === fold(geo_city);
    if (geo_region) return fold(s.region) === fold(geo_region);
    return true;
  });
  let geo_lat = null;
  let geo_lon = null;
  if (coordSrc.length) {
    geo_lat =
      coordSrc.reduce((a, s) => a + s.lat, 0) / coordSrc.length;
    geo_lon =
      coordSrc.reduce((a, s) => a + s.lon, 0) / coordSrc.length;
  }

  return {
    client_ip: ip,
    geo_city,
    geo_region,
    geo_country: countryMaj ? countryMaj.label : null,
    geo_country_code: codeMaj ? codeMaj.label : null,
    geo_isp: ispMaj ? ispMaj.label : null,
    geo_confidence: confidence,
    geo_lat,
    geo_lon,
    geo_sources: sources
  };
}

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS tit_resultados (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      institucion TEXT,
      pais TEXT,
      modalidad TEXT,
      nombre TEXT,
      email TEXT,
      supervisor_nombre TEXT,
      supervisor_email TEXT,
      download_mbps DOUBLE PRECISION,
      upload_mbps DOUBLE PRECISION,
      cupos JSONB,
      valido_hasta DATE,
      user_agent TEXT,
      client_ip TEXT,
      geo_city TEXT,
      geo_region TEXT,
      geo_country TEXT,
      geo_country_code TEXT,
      geo_isp TEXT,
      geo_confidence TEXT,
      geo_lat DOUBLE PRECISION,
      geo_lon DOUBLE PRECISION,
      geo_sources JSONB,
      client_timezone TEXT
    )
  `;
  await sql`ALTER TABLE tit_resultados ADD COLUMN IF NOT EXISTS client_ip TEXT`;
  await sql`ALTER TABLE tit_resultados ADD COLUMN IF NOT EXISTS geo_city TEXT`;
  await sql`ALTER TABLE tit_resultados ADD COLUMN IF NOT EXISTS geo_region TEXT`;
  await sql`ALTER TABLE tit_resultados ADD COLUMN IF NOT EXISTS geo_country TEXT`;
  await sql`ALTER TABLE tit_resultados ADD COLUMN IF NOT EXISTS geo_country_code TEXT`;
  await sql`ALTER TABLE tit_resultados ADD COLUMN IF NOT EXISTS geo_isp TEXT`;
  await sql`ALTER TABLE tit_resultados ADD COLUMN IF NOT EXISTS geo_confidence TEXT`;
  await sql`ALTER TABLE tit_resultados ADD COLUMN IF NOT EXISTS geo_lat DOUBLE PRECISION`;
  await sql`ALTER TABLE tit_resultados ADD COLUMN IF NOT EXISTS geo_lon DOUBLE PRECISION`;
  await sql`ALTER TABLE tit_resultados ADD COLUMN IF NOT EXISTS geo_sources JSONB`;
  await sql`ALTER TABLE tit_resultados ADD COLUMN IF NOT EXISTS client_timezone TEXT`;
}

async function listar(res) {
  await ensureTable();
  const r = await sql`
    SELECT
      id,
      created_at,
      institucion,
      pais,
      modalidad,
      nombre,
      email,
      supervisor_nombre,
      supervisor_email,
      download_mbps,
      upload_mbps,
      cupos,
      valido_hasta,
      user_agent,
      client_ip,
      geo_city,
      geo_region,
      geo_country,
      geo_country_code,
      geo_isp,
      geo_confidence,
      geo_lat,
      geo_lon,
      geo_sources,
      client_timezone
    FROM tit_resultados
    ORDER BY created_at DESC
    LIMIT 500
  `;
  const filas = (r.rows || []).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    institucion: norm(row.institucion),
    pais: norm(row.pais),
    modalidad: norm(row.modalidad),
    nombre: norm(row.nombre),
    email: norm(row.email),
    supervisor_nombre: norm(row.supervisor_nombre),
    supervisor_email: norm(row.supervisor_email),
    download_mbps: row.download_mbps != null ? Number(row.download_mbps) : null,
    upload_mbps: row.upload_mbps != null ? Number(row.upload_mbps) : null,
    cupos: row.cupos || {},
    valido_hasta: row.valido_hasta || null,
    user_agent: norm(row.user_agent),
    client_ip: norm(row.client_ip),
    geo_city: norm(row.geo_city),
    geo_region: norm(row.geo_region),
    geo_country: norm(row.geo_country),
    geo_country_code: norm(row.geo_country_code),
    geo_isp: norm(row.geo_isp),
    geo_confidence: norm(row.geo_confidence),
    geo_lat: row.geo_lat != null ? Number(row.geo_lat) : null,
    geo_lon: row.geo_lon != null ? Number(row.geo_lon) : null,
    geo_sources: row.geo_sources || [],
    client_timezone: norm(row.client_timezone)
  }));
  return res.status(200).json({ ok: true, total: filas.length, filas });
}

async function guardar(req, res) {
  const body = readBody(req);
  const institucion = norm(body.institucion).toUpperCase();
  const pais = norm(body.pais).toUpperCase();
  const modalidad = norm(body.modalidad).toLowerCase();
  const nombre = norm(body.nombre);
  const email = norm(body.email);
  const supervisor_nombre = norm(body.supervisor_nombre || body.supNombre);
  const supervisor_email = norm(body.supervisor_email || body.supEmail);
  const download_mbps = Number(body.download_mbps ?? body.downloadMbps);
  const upload_mbps = Number(body.upload_mbps ?? body.uploadMbps);
  const cupos = body.cupos && typeof body.cupos === "object" ? body.cupos : {};
  const user_agent = norm(body.user_agent || req.headers["user-agent"] || "");
  const client_timezone = norm(body.client_timezone || body.timezone);

  if (!institucion || !pais) {
    return res.status(400).json({ ok: false, error: "Faltan institución o país" });
  }
  if (modalidad !== "cable" && modalidad !== "wifi") {
    return res.status(400).json({ ok: false, error: "Modalidad debe ser cable o wifi" });
  }
  if (!nombre || !email) {
    return res.status(400).json({ ok: false, error: "Faltan nombre o correo de quien realiza el test" });
  }
  if (!Number.isFinite(download_mbps) || download_mbps <= 0) {
    return res.status(400).json({ ok: false, error: "Falta velocidad de descarga válida" });
  }

  const up =
    Number.isFinite(upload_mbps) && upload_mbps >= 0 ? upload_mbps : 0;

  const valido = new Date();
  valido.setMonth(valido.getMonth() + 6);
  const validoHasta = valido.toISOString().slice(0, 10);

  const geo = await lookupGeo(clientIp(req), req);

  await ensureTable();

  const ins = await sql`
    INSERT INTO tit_resultados (
      institucion, pais, modalidad,
      nombre, email, supervisor_nombre, supervisor_email,
      download_mbps, upload_mbps, cupos, valido_hasta, user_agent,
      client_ip, geo_city, geo_region, geo_country, geo_country_code,
      geo_isp, geo_confidence, geo_lat, geo_lon, geo_sources, client_timezone
    )
    VALUES (
      ${institucion},
      ${pais},
      ${modalidad},
      ${nombre},
      ${email},
      ${supervisor_nombre || null},
      ${supervisor_email || null},
      ${download_mbps},
      ${up},
      ${JSON.stringify(cupos)}::jsonb,
      ${validoHasta},
      ${user_agent || null},
      ${geo.client_ip || null},
      ${geo.geo_city || null},
      ${geo.geo_region || null},
      ${geo.geo_country || null},
      ${geo.geo_country_code || null},
      ${geo.geo_isp || null},
      ${geo.geo_confidence || null},
      ${geo.geo_lat},
      ${geo.geo_lon},
      ${JSON.stringify(geo.geo_sources || [])}::jsonb,
      ${client_timezone || null}
    )
    RETURNING id, created_at, valido_hasta, client_ip, geo_city, geo_region, geo_country, geo_confidence
  `;

  const row = ins.rows[0];
  return res.status(200).json({
    ok: true,
    id: row.id,
    created_at: row.created_at,
    valido_hasta: row.valido_hasta,
    client_ip: row.client_ip || null,
    geo_city: row.geo_city || null,
    geo_region: row.geo_region || null,
    geo_country: row.geo_country || null,
    geo_confidence: row.geo_confidence || null
  });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return await listar(res);
    }
    if (req.method === "POST") {
      return await guardar(req, res);
    }
    return res.status(405).json({ error: "Solo GET o POST" });
  } catch (e) {
    console.error("tit-resultados error", e);
    return res.status(500).json({
      ok: false,
      error: "Error en TIT resultados",
      detail: String(e && e.message ? e.message : e)
    });
  }
};
