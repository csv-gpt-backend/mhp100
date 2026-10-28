/**
 * Match — emparejar dos intentos individuales ya guardados.
 * GET ?list=1 → lista reciente de perfiles MATCH
 * GET/POST codigoA + codigoB → índice de pareja
 */
"use strict";

const { sql } = require("@vercel/postgres");
const rules = require("./data/plan50plus-r2.json");
const { scorePairFromProfiles, scorePerson } = require("./match-engine");
const bank = require("./data/match-bank.json");

function asObject(raw) {
  let value = raw;
  for (let i = 0; i < 2 && typeof value === "string"; i++) {
    try {
      value = JSON.parse(value);
    } catch (e) {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  return value;
}

function isMatchCodigo(codigo) {
  return String(codigo || "").toUpperCase().includes("MATCH");
}

function displayName(attempt, resultados) {
  const r = resultados || {};
  const joined = [r.nombre_pila, r.apellido].filter(Boolean).join(" ").trim();
  return joined || attempt.nombre || attempt.codigo || "—";
}

function profileFromAttempt(attempt) {
  const resultados = asObject(attempt.resultados) || {};
  const responses = asObject(attempt.responses);

  // Preferir barras ya calculadas en submit; si faltan, recalcular desde responses.
  let bars = resultados.bars;
  let eco = resultados.eco;
  let subBars = resultados.subBars || {};
  let aciertos = resultados.aciertos;
  let flags = resultados.flags || [];

  if ((!bars || bars.V == null) && responses) {
    const p = scorePerson(responses, bank, rules);
    bars = p.bars;
    eco = p.eco;
    subBars = p.subBars || {};
    aciertos = p.aciertos;
    flags = p.flags || [];
  }

  if (!bars || bars.V == null || bars.S == null) {
    return { ok: false, error: "El intento no tiene perfil Match completo (faltan barras)." };
  }

  return {
    ok: true,
    nombre: displayName(attempt, resultados),
    codigo: attempt.codigo,
    bars,
    eco: eco || {},
    subBars,
    aciertos: aciertos != null ? aciertos : null,
    flags,
    institucion: attempt.institucion || null,
  };
}

async function latestMatchAttempt(codigo) {
  const c = String(codigo || "").trim().toUpperCase();
  if (!c) return null;
  if (!isMatchCodigo(c)) return null;
  const r = await sql`
    SELECT *
    FROM attempts
    WHERE UPPER(codigo) = UPPER(${c})
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return r.rows[0] || null;
}

async function listMatchProfiles(limit) {
  const lim = Math.min(Math.max(Number(limit) || 40, 1), 100);
  // Intentos cuyo código es MATCH; un perfil por código (el más reciente).
  const r = await sql`
    SELECT DISTINCT ON (UPPER(codigo))
      codigo, nombre, institucion, resultados, created_at
    FROM attempts
    WHERE UPPER(codigo) LIKE '%MATCH%'
    ORDER BY UPPER(codigo), created_at DESC
    LIMIT ${lim}
  `;
  return (r.rows || []).map((row) => {
    const res = asObject(row.resultados) || {};
    return {
      codigo: row.codigo,
      nombre: displayName(row, res),
      institucion: row.institucion || null,
      fecha: row.created_at || null,
      tiene_barras: !!(res.bars && res.bars.V != null),
    };
  }).filter((p) => p.tiene_barras);
}

function pairFromProfiles(pa, pb) {
  const profileA = {
    bars: pa.bars,
    eco: pa.eco,
    subBars: pa.subBars || {},
    aciertos: pa.aciertos,
    flags: pa.flags || [],
  };
  const profileB = {
    bars: pb.bars,
    eco: pb.eco,
    subBars: pb.subBars || {},
    aciertos: pb.aciertos,
    flags: pb.flags || [],
  };
  const pair = scorePairFromProfiles(profileA, profileB, rules);
  return {
    ok: true,
    nombreA: pa.nombre,
    nombreB: pb.nombre,
    codigoA: pa.codigo,
    codigoB: pb.codigo,
    barsA: pa.bars,
    barsB: pb.bars,
    pair,
    source: "hit",
  };
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET" && String(req.query.list || "") === "1") {
      const profiles = await listMatchProfiles(req.query.limit);
      return res.status(200).json({ ok: true, profiles });
    }

    const body = req.method === "POST" ? (req.body || {}) : {};
    const codigoA = String(
      (req.query && req.query.codigoA) || body.codigoA || ""
    ).trim().toUpperCase();
    const codigoB = String(
      (req.query && req.query.codigoB) || body.codigoB || ""
    ).trim().toUpperCase();

    if (req.method !== "GET" && req.method !== "POST") {
      return res.status(405).json({ error: "Solo GET o POST" });
    }
    if (!codigoA || !codigoB) {
      return res.status(400).json({ error: "Faltan codigoA y codigoB" });
    }
    if (codigoA === codigoB) {
      return res.status(400).json({ error: "Elija dos códigos distintos" });
    }

    const attA = await latestMatchAttempt(codigoA);
    const attB = await latestMatchAttempt(codigoB);
    if (!attA) return res.status(404).json({ error: "No hay intento Match para A: " + codigoA });
    if (!attB) return res.status(404).json({ error: "No hay intento Match para B: " + codigoB });

    const pa = profileFromAttempt(attA);
    const pb = profileFromAttempt(attB);
    if (!pa.ok) return res.status(400).json({ error: "Perfil A: " + pa.error });
    if (!pb.ok) return res.status(400).json({ error: "Perfil B: " + pb.error });

    return res.status(200).json(pairFromProfiles(pa, pb));
  } catch (err) {
    console.error("pair-match", err);
    return res.status(500).json({ error: "No se pudo calcular el Match de pareja.", detail: err.message });
  }
};
