/**
 * Match Ver 3 — emparejar dos intentos MATCHE.
 * GET ?list=1 → lista perfiles MATCHE
 * GET/POST codigoA + codigoB → I + C_comp + Capa 1
 */
"use strict";

const { sql } = require("@vercel/postgres");
const rules = require("./data/plan50plus-capas.json");
const bank = require("./data/match-bank.json");
const {
  scorePairFromProfilesCapas,
  scorePerson,
} = require("./match-engine-capas");
const { shadowPair, applySeV12, cognitiveRecount } = require("./score-match-ver3");

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

function isMatchCapasCodigo(codigo) {
  const c = String(codigo || "").toUpperCase();
  return c.includes("MATCHE");
}

function displayName(attempt, resultados) {
  const r = resultados || {};
  const joined = [r.nombre_pila, r.apellido].filter(Boolean).join(" ").trim();
  return joined || attempt.nombre || attempt.codigo || "—";
}

function profileFromAttempt(attempt) {
  const resultados = asObject(attempt.resultados) || {};
  const responses = asObject(attempt.responses);

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

  if (responses) {
    const cog = cognitiveRecount(responses);
    if (cog && bars) {
      bars = Object.assign({}, bars, { C: cog.bar });
      aciertos = cog.aciertos;
    }
  }

  if (!bars || bars.V == null || bars.S == null) {
    return { ok: false, error: "El intento no tiene perfil Match Ver 3 completo (faltan barras)." };
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
    responses: responses || null,
    institucion: attempt.institucion || null,
  };
}

async function latestAttempt(codigo) {
  const c = String(codigo || "").trim().toUpperCase();
  if (!c || !isMatchCapasCodigo(c)) return null;
  const r = await sql`
    SELECT *
    FROM attempts
    WHERE UPPER(codigo) = UPPER(${c})
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return r.rows[0] || null;
}

async function listProfiles(limit) {
  const lim = Math.min(Math.max(Number(limit) || 40, 1), 100);
  const r = await sql`
    SELECT DISTINCT ON (UPPER(codigo))
      codigo, nombre, institucion, resultados, created_at
    FROM attempts
    WHERE UPPER(codigo) LIKE '%MATCHE%'
    ORDER BY UPPER(codigo), created_at DESC
    LIMIT ${lim}
  `;
  return (r.rows || [])
    .map((row) => {
      const res = asObject(row.resultados) || {};
      return {
        codigo: row.codigo,
        nombre: displayName(row, res),
        institucion: row.institucion || null,
        fecha: row.created_at || null,
        tiene_barras: !!(res.bars && res.bars.V != null),
        product: res.product || null,
      };
    })
    .filter((p) => p.tiene_barras);
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
  const shadow = shadowPair(pa.responses, pb.responses);
  const pair = applySeV12(
    scorePairFromProfilesCapas(profileA, profileB, rules),
    pa.eco,
    pb.eco,
    pa.responses,
    pb.responses,
    shadow
  );
  return {
    ok: true,
    product: "MATCHE",
    nombreA: pa.nombre,
    nombreB: pb.nombre,
    codigoA: pa.codigo,
    codigoB: pb.codigo,
    barsA: pa.bars,
    barsB: pb.bars,
    ecoA: pa.eco,
    ecoB: pb.eco,
    crisisA: pa.eco && pa.eco.CRISIS != null ? pa.eco.CRISIS : null,
    crisisB: pb.eco && pb.eco.CRISIS != null ? pb.eco.CRISIS : null,
    pair,
    shadow,
    source: "hit",
  };
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET" && String(req.query.list || "") === "1") {
      const profiles = await listProfiles(req.query.limit);
      return res.status(200).json({ ok: true, profiles, product: "MATCHE" });
    }

    const body = req.method === "POST" ? req.body || {} : {};
    const codigoA = String((req.query && req.query.codigoA) || body.codigoA || "")
      .trim()
      .toUpperCase();
    const codigoB = String((req.query && req.query.codigoB) || body.codigoB || "")
      .trim()
      .toUpperCase();

    if (req.method !== "GET" && req.method !== "POST") {
      return res.status(405).json({ error: "Solo GET o POST" });
    }
    if (!codigoA || !codigoB) {
      return res.status(400).json({ error: "Faltan codigoA y codigoB" });
    }
    if (codigoA === codigoB) {
      return res.status(400).json({ error: "Elija dos códigos distintos" });
    }
    if (!isMatchCapasCodigo(codigoA) || !isMatchCapasCodigo(codigoB)) {
      return res.status(400).json({
        error: "Match Ver 3 solo empareja códigos MATCHE (el Match original no se toca).",
      });
    }

    const attA = await latestAttempt(codigoA);
    const attB = await latestAttempt(codigoB);
    if (!attA) return res.status(404).json({ error: "No hay intento Match Ver 3 para A: " + codigoA });
    if (!attB) return res.status(404).json({ error: "No hay intento Match Ver 3 para B: " + codigoB });

    const pa = profileFromAttempt(attA);
    const pb = profileFromAttempt(attB);
    if (!pa.ok) return res.status(400).json({ error: "Perfil A: " + pa.error });
    if (!pb.ok) return res.status(400).json({ error: "Perfil B: " + pb.error });

    return res.status(200).json(pairFromProfiles(pa, pb));
  } catch (err) {
    console.error("pair-match-ver3", err);
    return res.status(500).json({
      error: "No se pudo calcular el Match Ver 3 de pareja.",
      detail: err.message,
    });
  }
};
