const { sql } = require("@vercel/postgres");

function norm(v) {
  return String(v ?? "").trim();
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

async function lookupGeo(ip) {
  const empty = {
    client_ip: ip || null,
    geo_city: null,
    geo_region: null,
    geo_country: null,
    geo_country_code: null
  };
  if (!ip || isPrivateIp(ip)) return empty;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const r = await fetch("https://ipwho.is/" + encodeURIComponent(ip), {
      signal: ctrl.signal,
      headers: { Accept: "application/json" }
    });
    clearTimeout(t);
    if (!r.ok) return empty;
    const j = await r.json();
    if (!j || j.success === false) return empty;
    return {
      client_ip: ip,
      geo_city: norm(j.city) || null,
      geo_region: norm(j.region) || null,
      geo_country: norm(j.country) || null,
      geo_country_code: norm(j.country_code).toUpperCase() || null
    };
  } catch (e) {
    console.warn("tit geo-ip lookup failed", e && e.message ? e.message : e);
    return empty;
  }
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
      geo_country_code TEXT
    )
  `;
  await sql`ALTER TABLE tit_resultados ADD COLUMN IF NOT EXISTS client_ip TEXT`;
  await sql`ALTER TABLE tit_resultados ADD COLUMN IF NOT EXISTS geo_city TEXT`;
  await sql`ALTER TABLE tit_resultados ADD COLUMN IF NOT EXISTS geo_region TEXT`;
  await sql`ALTER TABLE tit_resultados ADD COLUMN IF NOT EXISTS geo_country TEXT`;
  await sql`ALTER TABLE tit_resultados ADD COLUMN IF NOT EXISTS geo_country_code TEXT`;
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
      geo_country_code
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
    geo_country_code: norm(row.geo_country_code)
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

  const geo = await lookupGeo(clientIp(req));

  await ensureTable();

  const ins = await sql`
    INSERT INTO tit_resultados (
      institucion, pais, modalidad,
      nombre, email, supervisor_nombre, supervisor_email,
      download_mbps, upload_mbps, cupos, valido_hasta, user_agent,
      client_ip, geo_city, geo_region, geo_country, geo_country_code
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
      ${geo.geo_country_code || null}
    )
    RETURNING id, created_at, valido_hasta, client_ip, geo_city, geo_region, geo_country
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
    geo_country: row.geo_country || null
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
