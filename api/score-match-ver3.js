/**
 * Puntaje Match Ver 3 (MATCHE).
 * I y barras = mismas reglas Capas. E11–E16 se guardan en sombra y no mueven el I.
 */
"use strict";

const bank = require("./data/match-bank-ver3.json");
const rules = require("./data/plan50plus-capas.json");
const { scorePerson, round2 } = require("./match-engine-capas");

function profileComposite(bars) {
  const w = rules.index_weights || {};
  let acc = 0;
  let ws = 0;
  for (const k of Object.keys(w)) {
    const v = bars[k];
    if (v == null || !Number.isFinite(Number(v))) continue;
    acc += w[k] * Number(v);
    ws += w[k];
  }
  if (ws <= 0) return null;
  return round2(acc / ws);
}

function shadowPack(responses, profile) {
  const scored = profile.scored || {};
  const byId = {};
  const foils = [];
  let knowSum = 0;
  let knowN = 0;
  for (const it of bank.items) {
    if (!it.shadow) continue;
    const v = scored[it.id];
    byId[it.id] = v == null ? null : v;
    if (it.sub === "KNOW" && typeof v === "number") {
      knowSum += v;
      knowN += 1;
    }
    if (it.foil && typeof v === "number" && v >= (200 / 3) - 0.01) foils.push(it.id);
  }
  const e12a = byId["ECO-E12A"];
  const e12b = byId["ECO-E12B"];
  return {
    mode: "sombra",
    values: byId,
    delta_agen: e12a != null && e12b != null ? round2(e12b - e12a) : null,
    know_acc: knowN ? round2(knowSum / knowN) : null,
    oct_bias: foils.length,
    note: "E11–E16 no entran al índice I.",
  };
}

function scoreMatchVer3(responses, startTime) {
  if (!responses || typeof responses !== "object") {
    return { ok: false, error: "Faltan respuestas." };
  }
  const scoring = (bank.items || []).filter((it) => it.scores);
  for (const it of scoring) {
    if (responses[it.id] == null || responses[it.id] === "") {
      return { ok: false, error: "Faltan respuestas." };
    }
  }
  for (const id of ["ATT-1", "ATT-2"]) {
    if (responses[id] == null || responses[id] === "") {
      return { ok: false, error: "Faltan respuestas." };
    }
  }

  const profile = scorePerson(responses, bank, rules);
  const composite = profileComposite(profile.bars || {});
  const end = Date.now();
  const start = startTime ? Number(startTime) : null;
  const duration_sec =
    start && Number.isFinite(start) ? Math.max(0, Math.round((end - start) / 1000)) : null;

  return {
    ok: true,
    resultados: {
      product: "MATCHE",
      rules_version: "plan50plus-ver3",
      bank_version: bank.version || "MATCH-v3",
      layers: ["capa1", "capa2", "capa3", "e11-e16-sombra"],
      bars: profile.bars,
      subBars: profile.subBars || {},
      eco: profile.eco || {},
      aciertos: profile.aciertos,
      aciertos_max: profile.aciertos_max,
      flags: profile.flags || [],
      composite,
      shadow: shadowPack(responses, profile),
      duration_sec,
      meta: {
        n_scoring: bank.n_scoring,
        n_attention: bank.n_attention,
        shadow: true,
      },
    },
  };
}

module.exports = { scoreMatchVer3, profileComposite };
