/**
 * Puntaje Match Ver 3 (MATCHE).
 * I y barras = mismas reglas Capas. E11–E16 se guardan en sombra y no mueven el I.
 */
"use strict";

const bank = require("./data/match-bank-ver3.json");
const rules = require("./data/plan50plus-capas.json");
const { scorePerson, round2, clip, comboText, bandOf } = require("./match-engine-capas");

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

function idxOf(raw, n) {
  const i = Number(raw);
  if (!Number.isFinite(i) || i < 0 || i >= n) return null;
  return i;
}

function e10Code(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim().toUpperCase();
  if (/^[A-E]$/.test(s)) return s;
  const i = Number(raw);
  const codes = ["A", "B", "C", "D", "E"];
  if (Number.isFinite(i) && i >= 0 && i < codes.length) return codes[i];
  return null;
}

function aportePerfil(i14, i16) {
  if (i14 == null || i16 == null) return null;
  if (i14 >= 3 && i16 <= 1) return "Capital";
  if (i14 <= 1 && i16 >= 2) return "Conocimiento";
  return "Mixto";
}

/** Lectura de una persona. No entra al I ni a C_comp. */
function shadowPerson(responses) {
  const r = responses || {};
  const i11 = idxOf(r["ECO-E11"], 8);
  const i12a = idxOf(r["ECO-E12A"], 8);
  const i12b = idxOf(r["ECO-E12B"], 8);
  const i13 = idxOf(r["ECO-E13"], 6);
  const i14 = idxOf(r["ECO-E14"], 6);
  const i16 = idxOf(r["ECO-E16"], 4);
  const i06 = idxOf(r["ECO-E06"], 5);
  const e10 = e10Code(r["ECO-E10"]);
  const v11 = i11 == null ? null : round2((100 * i11) / 7);
  const v12a = i12a == null ? null : round2((100 * (7 - i12a)) / 7);
  const v12b = i12b == null ? null : round2((100 * (7 - i12b)) / 7);
  const v13 = i13 == null ? null : round2(20 * i13);
  const v14 = i14 == null ? null : round2(20 * i14);
  const v16 = i16 == null ? null : round2((100 * i16) / 3);
  const realIds = ["ECO-E15-1", "ECO-E15-2", "ECO-E15-3", "ECO-E15-4", "ECO-E15-5", "ECO-E15-6"];
  const foilIds = ["ECO-E15-7", "ECO-E15-8", "ECO-E15-9"];
  const realI = realIds.map((id) => idxOf(r[id], 4)).filter((x) => x != null);
  const know_acc = realI.length ? round2((100 * (realI.reduce((a, b) => a + b, 0) / realI.length)) / 3) : null;
  const oct_bias = foilIds.reduce((n, id) => {
    const i = idxOf(r[id], 4);
    return n + (i != null && i >= 2 ? 1 : 0);
  }, 0);
  const deltaRaw = v12a != null && v12b != null ? (100 * (7 - i12b)) / 7 - (100 * (7 - i12a)) / 7 : null;
  const delta_agen = deltaRaw == null ? null : round2(deltaRaw);
  const flags = [];
  if (i11 != null && i11 >= 6 && e10 === "B") flags.push("EC-INFO-ESCAL");
  if (i12a != null && i12b != null && i12a - i12b >= 2) flags.push("EC-AM-AGEN");
  if (i12a != null && i12b != null && i12b - i12a >= 2) flags.push("EC-INFO-AGEN-NEG");
  if (i06 === 0 && i14 != null && i14 >= 3) flags.push("EC-INC-CAP");
  if (oct_bias >= 2) flags.push("EC-OVER");
  else if (oct_bias === 1) flags.push("EC-INFO-OVER");
  if (i16 === 3 && oct_bias >= 2) flags.push("EC-INC-KNOW");
  return {
    i11, i12a, i12b, i13, i14, i16, i06, e10,
    v11, v12a, v12b, v13, v14, v16,
    know_acc,
    oct_bias,
    delta_agen,
    perfil: aportePerfil(i14, i16),
    flags,
  };
}

/** Pareja. S_REP y coberturas se ven; no mueven I ni C_comp. Sin reloj, ATT-OCT no sale. */
function shadowPair(responsesA, responsesB) {
  const A = shadowPerson(responsesA);
  const B = shadowPerson(responsesB);
  const d11 = A.i11 != null && B.i11 != null ? Math.abs(A.i11 - B.i11) : null;
  const d13 = A.i13 != null && B.i13 != null ? Math.abs(A.i13 - B.i13) : null;
  const S_REP = d13 == null ? null : round2(100 - 20 * d13);
  const cobertura_cap = A.v14 == null && B.v14 == null ? null : round2(Math.max(A.v14 || 0, B.v14 || 0));
  const cobertura_know = A.know_acc == null && B.know_acc == null ? null : round2(Math.max(A.know_acc || 0, B.know_acc || 0));
  const cobertura_evid = A.v16 == null && B.v16 == null ? null : round2(Math.max(A.v16 || 0, B.v16 || 0));
  const flags = [];
  if (d11 != null && d11 >= 3) flags.push("EC-AM-PERD");
  if (d13 != null && d13 >= 2) flags.push("EC-AM-REP");
  const max14 = A.i14 == null && B.i14 == null ? null : Math.max(A.i14 == null ? -1 : A.i14, B.i14 == null ? -1 : B.i14);
  const max16 = A.i16 == null && B.i16 == null ? null : Math.max(A.i16 == null ? -1 : A.i16, B.i16 == null ? -1 : B.i16);
  if (max14 != null && max16 != null && max14 <= 1 && max16 <= 1 && max14 >= 0 && max16 >= 0) flags.push("EC-AM-BASE");
  flags.push.apply(flags, A.flags);
  flags.push.apply(flags, B.flags);
  return {
    mode: "sombra",
    moves_index: false,
    S_REP,
    d13,
    cobertura_cap,
    cobertura_know,
    cobertura_evid,
    A: { perfil: A.perfil, delta_agen: A.delta_agen, know_acc: A.know_acc, v14: A.v14, v16: A.v16, i13: A.i13, flags: A.flags },
    B: { perfil: B.perfil, delta_agen: B.delta_agen, know_acc: B.know_acc, v14: B.v14, v16: B.v16, i13: B.i13, flags: B.flags },
    flags,
  };
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

function aversionShown(ra, responses) {
  if (ra == null || !Number.isFinite(Number(ra))) return null;
  let a = 100 - Number(ra);
  const i12a = idxOf(responses && responses["ECO-E12A"], 8);
  const i12b = idxOf(responses && responses["ECO-E12B"], 8);
  if (i12a != null && i12b != null && i12a > i12b) {
    a -= (100 * (i12a - i12b)) / 7;
  }
  return round2(clip(a));
}

function knowNet(responses) {
  const r = responses || {};
  const realIds = ["ECO-E15-1", "ECO-E15-2", "ECO-E15-3", "ECO-E15-4", "ECO-E15-5", "ECO-E15-6"];
  const foilIds = ["ECO-E15-7", "ECO-E15-8", "ECO-E15-9"];
  const realI = realIds.map((id) => idxOf(r[id], 4)).filter((x) => x != null);
  if (!realI.length) return 0;
  const know = (100 * (realI.reduce((s, x) => s + x, 0) / realI.length)) / 3;
  const foils = foilIds.reduce((n, id) => n + ((idxOf(r[id], 4) || 0) >= 2 ? 1 : 0), 0);
  return clip(know - foils * (100 / 3));
}

function bandComp(c) {
  if (c == null) return null;
  if (c >= 75) return "Alta";
  if (c >= 60) return "Media";
  if (c >= 45) return "Reservada";
  return "Baja";
}

/**
 * La 11 y la 12a entran al promedio de riesgo, cada una con la misma parte que las cinco viejas.
 * La 12b no entra. Solo MATCHE. Si el perfil ya trae risk_version, no se suma dos veces.
 */
function foldRiskIntoProfile(profile, responses) {
  if (!profile || !profile.eco || profile.eco.RA == null) return profile;
  if (profile.eco.risk_version === "11-12a") return profile;
  const i11 = Number(responses && responses["ECO-E11"]);
  const i12 = Number(responses && responses["ECO-E12A"]);
  if (!Number.isFinite(i11) || i11 < 0 || i11 > 7) return profile;
  if (!Number.isFinite(i12) || i12 < 0 || i12 > 7) return profile;
  const v11 = (100 * i11) / 7;
  const v12 = (100 * (7 - i12)) / 7;
  const old = Number(profile.eco.RA);
  const RA = round2((old * 5 + v11 + v12) / 7);
  const be = rules.economic.barra_E;
  const barE = round2(be.RA * RA + be.PA * Number(profile.eco.PA) + be.CAP * Number(profile.eco.CAP));
  return Object.assign({}, profile, {
    bars: Object.assign({}, profile.bars, { E: barE }),
    eco: Object.assign({}, profile.eco, {
      RA,
      RA_sin_11_12: round2(old),
      risk_version: "11-12a",
    }),
  });
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

  const profile = foldRiskIntoProfile(scorePerson(responses, bank, rules), responses);
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

/**
 * S_E v1.2. El reparto entra en la barra. La 11 y la 12a ya van dentro de RA.
 * La 12b no entra al I: solo baja la aversión que se muestra si exige menos con el dinero del socio.
 * La 14, la 15 y la 16 entran al C_comp con peso 8 / 5 / 3; los roles pesan 84 (suma 100). No reemplazan mando, criterio ni ejecución.
 * d13 = 5 no pone la pareja en rojo.
 */
function applySeV12(pair, ecoA, ecoB, responsesA, responsesB, shadow) {
  if (!pair || pair.I == null || !pair.S || pair.S.E == null) return pair;
  if (!shadow || shadow.S_REP == null || !ecoA || !ecoB || ecoA.RA == null || ecoB.RA == null) return pair;
  const p = rules.economic.pair;
  const S_RA = clip(100 - p.ra_pendiente * Math.max(0, Math.abs(ecoA.RA - ecoB.RA) - p.ra_tol));
  const S_PA = clip(100 - p.pa_pendiente * Math.max(0, Math.abs((ecoA.PA || 0) - (ecoB.PA || 0)) - p.pa_tol));
  let dCtrl = 0;
  if (ecoA.ctrl_step != null && ecoB.ctrl_step != null) {
    dCtrl = Math.min(3, Math.abs(Number(ecoA.ctrl_step) - Number(ecoB.ctrl_step)));
  }
  const penCtrl = p.pen_ctrl[String(dCtrl)] != null ? p.pen_ctrl[String(dCtrl)] : 0;
  const nMin = [responsesA, responsesB].reduce((n, r) => {
    const e06 = Number(r && r["ECO-E06"]);
    const e07 = Number(r && r["ECO-E07"]);
    return n + (e06 === 0 && e07 === 0 ? 1 : 0);
  }, 0);
  const penCap = nMin === 2 ? 12 : nMin === 1 ? 6 : 0;
  const SE = round2(clip(0.45 * S_RA + 0.15 * S_PA + 20 - penCap + 0.2 * shadow.S_REP - penCtrl));
  const S = Object.assign({}, pair.S, { E: SE });
  const w0 = rules.index_weights;
  let wSum = 0;
  for (const d of ["V", "S", "H", "E", "L", "C"]) if (S[d] != null) wSum += w0[d];
  let I = 0;
  for (const d of ["V", "S", "H", "E", "L", "C"]) {
    if (S[d] == null) continue;
    I += (w0[d] / wSum) * S[d];
  }
  const redHit = (rules.red_cap.flags || []).some((f) => (pair.flags || []).includes(f));
  if (redHit) I = Math.min(I, rules.red_cap.max_index);
  I = round2(I);
  let C_comp = pair.C_comp;
  let C_comp_band = pair.C_comp_band;
  let C_comp_roles = pair.C_comp;
  if (C_comp != null && shadow) {
    const cap = shadow.cobertura_cap == null ? 0 : Number(shadow.cobertura_cap);
    const evid = shadow.cobertura_evid == null ? 0 : Number(shadow.cobertura_evid);
    const know = Math.max(knowNet(responsesA), knowNet(responsesB));
    // Reparto 84 / 8 / 5 / 3: suma 100. El 100 solo sale si todo está en 100.
    C_comp = round2(clip(0.84 * C_comp + 0.08 * cap + 0.05 * know + 0.03 * evid));
    C_comp_band = bandComp(C_comp);
  }
  const next = Object.assign({}, pair, {
    S,
    I,
    band: bandOf(I, rules),
    economic_version: "1.2",
    S_E_v11: pair.S.E,
    C_comp,
    C_comp_band,
    C_comp_roles,
  });
  next.combo_text = comboText(I, C_comp, rules);
  return next;
}

function cognitiveRecount(responses) {
  if (!responses || typeof responses !== "object") return null;
  const profile = scorePerson(responses, bank, rules);
  if (!profile || profile.aciertos == null) return null;
  return {
    aciertos: profile.aciertos,
    aciertos_max: profile.aciertos_max,
    bar: profile.bars ? profile.bars.C : null,
  };
}

module.exports = { scoreMatchVer3, profileComposite, shadowPerson, shadowPair, applySeV12, cognitiveRecount, foldRiskIntoProfile, aversionShown };
