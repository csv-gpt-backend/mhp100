/**
 * Puntaje Match (perfil individual) en servidor.
 * Respuestas crudas → scorePerson (motor Plan 50+ r2).
 */
"use strict";

const bank = require("./data/match-bank.json");
const rules = require("./data/plan50plus-r2.json");
const { scorePerson, round2 } = require("./match-engine");

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

function scoreMatch(responses, startTime) {
  if (!responses || typeof responses !== "object") {
    return { ok: false, error: "Faltan respuestas." };
  }

  const scoring = (bank.items || []).filter((it) => it.scores);
  for (const it of scoring) {
    if (responses[it.id] == null || responses[it.id] === "") {
      return { ok: false, error: "Faltan respuestas." };
    }
  }
  // ATT también deben estar
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
      product: "MATCH",
      rules_version: rules.rules_version || "plan50plus-r2",
      bank_version: bank.version || "MATCH-v1",
      bars: profile.bars,
      subBars: profile.subBars || {},
      eco: profile.eco || {},
      aciertos: profile.aciertos,
      aciertos_max: profile.aciertos_max,
      flags: profile.flags || [],
      composite,
      duration_sec,
      meta: {
        n_scoring: bank.n_scoring,
        n_attention: bank.n_attention,
      },
    },
  };
}

module.exports = { scoreMatch, profileComposite };
