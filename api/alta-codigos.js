const { sql } = require("@vercel/postgres");

const EVAL_KEYS = new Set([
  "INTELC",
  "INTEGR",
  "SOCIOE",
  "LIDERA",
  "HABITO",
  "APREND",
  "VOCACI"
]);

const SUFFIX_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_LOTE = 200;

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

function randomSuffix(len) {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += SUFFIX_CHARS[Math.floor(Math.random() * SUFFIX_CHARS.length)];
  }
  return out;
}

function periodoValido(p) {
  return /^\d{4}-\d{4}$/.test(p);
}

function nuevoLoteId() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `LOTE-${y}${m}${day}-${randomSuffix(4)}`;
}

async function codigoExiste(codigo) {
  const r = await sql`
    SELECT 1 AS ok
    FROM participants
    WHERE UPPER(codigo) = UPPER(${codigo})
    LIMIT 1
  `;
  return r.rows.length > 0;
}

async function generarCodigoUnico(ambito, evalKey) {
  const prefijo = `${ambito}-${evalKey}-`;
  for (let intento = 0; intento < 40; intento++) {
    const codigo = prefijo + randomSuffix(4);
    if (!(await codigoExiste(codigo))) return codigo;
  }
  throw new Error("No se pudo generar un código único; reintente");
}

function errorColumna(msg) {
  if (/lote/i.test(msg)) {
    return "Falta la columna lote en participants. Ejecute en Neon: ALTER TABLE participants ADD COLUMN IF NOT EXISTS lote TEXT;";
  }
  if (/periodo/i.test(msg)) {
    return "Falta la columna periodo en participants. Ejecute en Neon: ALTER TABLE participants ADD COLUMN IF NOT EXISTS periodo TEXT;";
  }
  if (/column/i.test(msg)) {
    return "Falta una columna en participants. Ejecute en Neon: ALTER TABLE participants ADD COLUMN IF NOT EXISTS periodo TEXT; ALTER TABLE participants ADD COLUMN IF NOT EXISTS lote TEXT;";
  }
  return null;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Solo POST" });
    }

    const body = readBody(req);
    const ambito = norm(body.ambito || "").toUpperCase();
    const evaluacion = norm(body.evaluacion || "").toUpperCase();
    const institucion = norm(body.institucion || "").toUpperCase();
    const pais = norm(body.pais || body.grupo || "").toUpperCase();
    const curso = norm(body.curso || "").toUpperCase();
    const periodo = norm(body.periodo || "");
    let cantidad = Number(body.cantidad);
    if (!Number.isFinite(cantidad) || cantidad < 1) cantidad = 1;
    cantidad = Math.min(MAX_LOTE, Math.floor(cantidad));

    const puedeVer =
      body.puede_ver_resultado === false ||
      body.puede_ver_resultado === "false" ||
      body.puede_ver_resultado === 0 ||
      body.puede_ver_resultado === "0"
        ? false
        : true;

    if (ambito !== "ESC" && ambito !== "PRO") {
      return res.status(400).json({ ok: false, error: "Ámbito debe ser ESC o PRO" });
    }
    if (!EVAL_KEYS.has(evaluacion)) {
      return res.status(400).json({
        ok: false,
        error: "Evaluación no válida (use clave de 6 letras)"
      });
    }
    if (!institucion) {
      return res.status(400).json({ ok: false, error: "Falta institución" });
    }
    if (!pais) {
      return res.status(400).json({ ok: false, error: "Falta país" });
    }
    if (!curso) {
      return res.status(400).json({ ok: false, error: "Falta curso" });
    }
    if (!periodoValido(periodo)) {
      return res.status(400).json({
        ok: false,
        error: "Periodo inválido. Use formato AAAA-AAAA (ej. 2026-2027)"
      });
    }

    const lote = nuevoLoteId();
    const creados = [];

    try {
      for (let i = 0; i < cantidad; i++) {
        const codigo = await generarCodigoUnico(ambito, evaluacion);
        await sql`
          INSERT INTO participants (
            codigo, nombre, institucion, grupo, curso, puede_ver_resultado, periodo, lote
          )
          VALUES (
            ${codigo},
            ${null},
            ${institucion},
            ${pais},
            ${curso},
            ${puedeVer},
            ${periodo},
            ${lote}
          )
        `;
        creados.push(codigo);
      }
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      const hint = errorColumna(msg);
      if (hint) {
        return res.status(500).json({
          ok: false,
          error: hint,
          detail: msg,
          creados_parcial: creados,
          lote
        });
      }
      throw e;
    }

    return res.status(200).json({
      ok: true,
      total: creados.length,
      lote,
      codigos: creados,
      ficha: {
        ambito,
        evaluacion,
        institucion,
        pais,
        curso,
        periodo,
        lote,
        puede_ver_resultado: puedeVer
      }
    });
  } catch (e) {
    console.error("alta-codigos error", e);
    return res.status(500).json({
      ok: false,
      error: "Error al crear códigos",
      detail: String(e && e.message ? e.message : e)
    });
  }
};
