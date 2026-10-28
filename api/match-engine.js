/**
 * ADALAM Match — motor Plan 50+ r2
 * Lee plan50plus-r2.json + match-bank.json. No toca bancos del portal.
 * Fuente de números: Word LINK (vía yaml/json). Código solo con Dale.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const CONFIG_DIR = path.join(__dirname, "data");

function loadRules(file) {
  const p = file || path.join(CONFIG_DIR, "plan50plus-r2.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function loadBank(file) {
  const p = file || path.join(CONFIG_DIR, "match-bank.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function clip(x, lo = 0, hi = 100) {
  if (!Number.isFinite(x)) return lo;
  return Math.min(hi, Math.max(lo, x));
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

/** Likert F-11: v = 100·(x'−1)/(M−1). Invertida Match: x' = M+1−x. */
function likertV(x, invertida, M) {
  const n = Number(x);
  if (!Number.isFinite(n) || n < 1 || n > M) return null;
  const xp = invertida ? M + 1 - n : n;
  return (100 * (xp - 1)) / (M - 1);
}

/** Evalúa v_formula del banco Económico. i = índice 0-based o valor de escala. */
function evalVFormula(formula, i) {
  if (!formula || typeof formula !== "string") return null;
  const f = formula.replace(/\s+/g, "");
  // Solo patrones del banco Match (ECO-E01…E10).
  const safe = /^(10\*i|25\*i|100\*i\/3|100\*\(8-i\)\/8|100\*\(11-i\)\/11|100\*\(6-i\)\/6)$/;
  if (!safe.test(f)) throw new Error("v_formula no admitida: " + formula);
  // eslint-disable-next-line no-new-func
  return Number(Function("i", "return " + formula)(i));
}

function itemV(item, raw, rules) {
  if (raw == null || raw === "") return null;
  const M = rules.likert.M;

  if (item.format === "likert") {
    return likertV(raw, !!item.invertida, M);
  }
  if (item.format === "cognitive") {
    const ans = String(raw).toLowerCase();
    const ok = String(item.correct || "").toLowerCase();
    return ans === ok ? 1 : 0; // acierto 0/1; la barra C se arma aparte
  }
  if (item.format === "attention") {
    return Number(raw); // x crudo; no puntúa
  }
  if (item.format === "scale_0_10") {
    const i = Number(raw);
    if (!Number.isFinite(i) || i < item.i_min || i > item.i_max) return null;
    return evalVFormula(item.v_formula, i);
  }
  if (item.format === "choice_index") {
    const i = Number(raw);
    if (!Number.isFinite(i) || i < 0 || i >= (item.options || []).length) return null;
    return evalVFormula(item.v_formula, i);
  }
  if (item.format === "category") {
    // E10: código A…; no entra a barra E
    return raw;
  }
  return null;
}

function mean(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Perfil de una persona a partir de respuestas { itemId: raw }.
 * raw Likert: 1|2|3 · Eco scale: 0..10 · Eco choice: índice 0-based · Cog: 'a'|'b'|…
 */
function scorePerson(answers, bank, rules) {
  const byId = Object.fromEntries(bank.items.map((it) => [it.id, it]));
  const scored = {}; // id → v (0..100) o acierto
  const missing = {};
  const flags = [];

  for (const it of bank.items) {
    const raw = answers[it.id];
    if (raw == null || raw === "") {
      if (it.scores) missing[it.id] = true;
      continue;
    }
    try {
      scored[it.id] = itemV(it, raw, rules);
    } catch (e) {
      missing[it.id] = true;
    }
  }

  // Atención
  let attFail = 0;
  for (const id of ["ATT-1", "ATT-2"]) {
    const it = byId[id];
    if (!it) continue;
    const exp = rules.attention[id].expected_x;
    const got = answers[id];
    if (got == null || Number(got) !== exp) attFail += 1;
  }
  if (attFail === 2) flags.push(rules.attention.fail_both);
  else if (attFail === 1) flags.push(rules.attention.fail_one);

  const subs = {};
  const domainItems = { V: [], S: [], H: [], L: [] };

  for (const it of bank.items) {
    if (!it.scores || it.domain == null) continue;
    if (it.format === "cognitive" || it.domain === "E" || it.domain === "C") continue;
    if (scored[it.id] == null || typeof scored[it.id] !== "number") continue;
    const v = scored[it.id];
    const key = it.domain + ":" + it.sub;
    if (!subs[key]) subs[key] = [];
    subs[key].push(v);
    if (domainItems[it.domain]) domainItems[it.domain].push(v);
  }

  const subBars = {};
  for (const [k, arr] of Object.entries(subs)) subBars[k] = mean(arr);

  // R2-02: V/H/L = media de ítems (= sub ponderada por cupo)
  const bars = {};
  for (const d of ["V", "H", "L"]) {
    bars[d] = mean(domainItems[d]);
  }

  // Socio: pesos fijos por sub
  const sw = rules.domain_bar.S_weights;
  let sAcc = 0;
  let sW = 0;
  const sSubs = {};
  for (const [sub, w] of Object.entries(sw)) {
    const m = subBars["S:" + sub];
    if (m == null) continue;
    sSubs[sub] = m;
    sAcc += w * m;
    sW += w;
  }
  bars.S = sW > 0 ? sAcc / sW : null;

  // Económico
  const eco = { RA: [], PA: [], CAP: [], CTRL: null, CRISIS: null };
  for (const it of bank.items) {
    if (it.domain !== "E" || !it.scores) continue;
    const v = scored[it.id];
    if (v == null) continue;
    if (it.sub === "RA" && it.in_bar) eco.RA.push(v);
    if (it.sub === "PA" && it.in_bar) eco.PA.push(v);
    if (it.sub === "CAP" && it.in_bar) eco.CAP.push(v);
    if (it.sub === "CTRL") {
      eco.CTRL = typeof v === "number" ? v : null;
      eco.ctrl_step = Number(answers[it.id]);
    }
    if (it.sub === "CRISIS") eco.CRISIS = v;
  }
  const RA = mean(eco.RA);
  const PA = mean(eco.PA);
  const CAP = mean(eco.CAP);
  const be = rules.economic.barra_E;
  bars.E =
    RA == null || PA == null || CAP == null
      ? null
      : be.RA * RA + be.PA * PA + be.CAP * CAP;

  // Intelectual
  const cogItems = bank.items.filter((it) => it.domain === "C" && it.scores);
  let aciertos = 0;
  let cogAnswered = 0;
  for (const it of cogItems) {
    if (scored[it.id] == null) continue;
    cogAnswered += 1;
    if (scored[it.id] === 1) aciertos += 1;
  }
  const nCog = rules.cognitive.n_items;
  bars.C = cogAnswered === nCog ? (100 * aciertos) / nCog : cogAnswered > 0 ? (100 * aciertos) / nCog : null;

  // Deseabilidad VAL-EXT (V+H, extremo v=100)
  const desIds = bank.items.filter(
    (it) => it.scores && (it.domain === "V" || it.domain === "H") && it.format === "likert"
  );
  let extreme = 0;
  let desN = 0;
  for (const it of desIds) {
    if (scored[it.id] == null) continue;
    desN += 1;
    if (scored[it.id] >= 100 - 1e-9) extreme += 1;
  }
  if (desN >= rules.social_desirability.n_items) {
    if (extreme / desN >= rules.social_desirability.extreme_threshold) flags.push("VAL-EXT");
  }

  // Completeness por dominio
  const present = {};
  for (const d of ["V", "S", "H", "E", "L", "C"]) {
    const need = bank.cupos[d];
    const got = bank.items.filter((it) => it.domain === d && it.scores && scored[it.id] != null).length;
    // E: CTRL/CRISIS también cuentan en cupo 10
    present[d] = { need, got, ratioMissing: need ? 1 - got / need : 1 };
  }

  return {
    bars,
    subBars: sSubs,
    allSubBars: subBars,
    eco: { RA, PA, CAP, CTRL: eco.CTRL, ctrl_step: eco.ctrl_step, CRISIS: eco.CRISIS },
    aciertos: cogAnswered ? aciertos : null,
    aciertos_max: nCog,
    flags,
    present,
    scored,
    missing,
  };
}

function domainAbsent(present, rules, d) {
  const p = present[d];
  if (!p) return true;
  return p.ratioMissing > rules.missing_data.max_missing_domain_ratio;
}

/** pen_piso + banderas AV/SO/HA según min de la pareja. */
function penPiso(minVal, sim, prefix) {
  const flags = [];
  let pen = 0;
  if (minVal < sim.piso_rojo) {
    pen = sim.pen_rojo;
    flags.push(prefix + "-RO");
  } else if (minVal < sim.piso_amarillo) {
    pen = sim.pen_amarillo;
    flags.push(prefix + "-AM");
  }
  return { pen, flags };
}

/** F-01 + R2-03 para V / S / H. */
function scoreVSH(barA, barB, key, rules, extra = {}) {
  const sim = rules.similarity[key];
  const flags = [];
  if (barA == null || barB == null) return { S: null, flags };

  const mn = Math.min(barA, barB);
  const mx = Math.max(barA, barB);
  const brecha = mx - mn;
  const S_base = 0.6 * mn + 0.4 * mx;
  const pen_brecha = brecha > sim.tol_brecha ? sim.k_brecha * (brecha - sim.tol_brecha) : 0;

  const prefix = key === "V" ? "AV" : key === "S" ? "SO" : "HA";
  const pp = penPiso(mn, sim, prefix);
  flags.push(...pp.flags);

  let pen_extra = 0;
  if (key === "S") {
    const agrA = extra.agrA;
    const agrB = extra.agrB;
    const asertA = extra.asertA;
    const asertB = extra.asertB;
    const agrMin = Math.min(
      agrA == null ? Infinity : agrA,
      agrB == null ? Infinity : agrB
    );
    if (Number.isFinite(agrMin) && agrMin < sim.agr_piso_amarillo) {
      pen_extra += sim.pen_agr;
      flags.push("SO-AM-AGR");
    }
    // SO-RO-AGR: misma persona Agr=0 y Asert≤50
    const check = (agr, asert) =>
      agr != null && asert != null && agr === sim.agr_rojo_val && asert <= sim.asert_rojo_max;
    if (check(agrA, asertA) || check(agrB, asertB)) flags.push("SO-RO-AGR");

    const timA = extra.timA;
    const timB = extra.timB;
    if (timA === 0 || timB === 0) flags.push("SO-INFO-TIM");
  }

  const S = clip(S_base - pp.pen - pen_brecha - pen_extra);
  return { S, flags, detail: { S_base, pen_piso: pp.pen, pen_brecha, pen_extra, mn, mx, brecha } };
}

/** F-12 Liderazgo. */
function scoreL(barA, barB, rules) {
  const L = rules.leadership;
  const flags = [];
  if (barA == null || barB == null) return { S: null, flags };

  const mn = Math.min(barA, barB);
  const mx = Math.max(barA, barB);
  let cobertura;
  if (mx >= L.cobertura_umbral) cobertura = 100;
  else cobertura = clip(100 - L.cobertura_pendiente * (L.cobertura_umbral - mx));

  const pen_min = mn < L.min_floor ? L.min_floor - mn : 0;
  const S = clip(L.w_cobertura * cobertura + L.w_max * mx + L.w_min * mn - pen_min);

  if (mx < L.cobertura_umbral) flags.push("LI-AM");
  else if (Math.abs(barA - barB) >= L.info_brecha) flags.push("LI-INFO");

  return { S, flags, detail: { cobertura, pen_min, mn, mx } };
}

/** F-02 + F-03 Intelectual. Preferir aciertos; si no, barras C. */
function scoreC(aciertosA, aciertosB, barA, barB, rules) {
  const C = rules.cognitive;
  const flags = [];
  let ca;
  let cb;
  let k;

  if (aciertosA != null && aciertosB != null) {
    ca = (100 * aciertosA) / C.n_items;
    cb = (100 * aciertosB) / C.n_items;
    k = Math.abs(aciertosA - aciertosB);
  } else if (barA != null && barB != null) {
    ca = barA;
    cb = barB;
    // k aproximado por grid de 6
    const aN = Math.round((barA / 100) * C.n_items);
    const bN = Math.round((barB / 100) * C.n_items);
    k = Math.abs(aN - bN);
  } else {
    return { S: null, flags };
  }

  const brecha = Math.abs(ca - cb);
  let S;
  if (brecha <= C.tol_brecha) S = 100 - C.slope_bajo_tol * brecha;
  else S = C.intercepto_en_tol - C.slope_sobre_tol * (brecha - C.tol_brecha);
  S = clip(S);

  if (k >= C.in_am_k_items) flags.push("IN-AM");
  return { S, flags, detail: { ca, cb, brecha, k } };
}

/** Económico §4 Plan 60. */
function scoreE(ecoA, ecoB, rules) {
  const p = rules.economic.pair;
  const flags = [];
  if (!ecoA || !ecoB || ecoA.RA == null || ecoB.RA == null || ecoA.PA == null || ecoB.PA == null) {
    return { S: null, flags };
  }

  const S_RA = clip(100 - p.ra_pendiente * Math.max(0, Math.abs(ecoA.RA - ecoB.RA) - p.ra_tol));
  const S_PA = clip(100 - p.pa_pendiente * Math.max(0, Math.abs(ecoA.PA - ecoB.PA) - p.pa_tol));

  const CAP_A = ecoA.CAP;
  const CAP_B = ecoB.CAP;
  let d_cap = 0;
  if (CAP_A != null && CAP_B != null) {
    const gap = Math.abs(CAP_A - CAP_B);
    if (gap >= (p.cap_brecha_roja != null ? p.cap_brecha_roja : 75)) d_cap = 2;
    else if (gap >= p.cap_brecha_amarilla) d_cap = 1;
    if (gap >= p.cap_brecha_amarilla) flags.push("EC-AM-CAP");
    if (Math.max(CAP_A, CAP_B) <= p.cap_runway_max) flags.push("EC-AM-RUNWAY");
  }
  const pen_cap = p.pen_cap[String(d_cap)] != null ? p.pen_cap[String(d_cap)] : 0;

  let d_ctrl = 0;
  if (ecoA.ctrl_step != null && ecoB.ctrl_step != null) {
    d_ctrl = Math.abs(Number(ecoA.ctrl_step) - Number(ecoB.ctrl_step));
    d_ctrl = Math.min(3, d_ctrl);
  }
  const pen_ctrl = p.pen_ctrl[String(d_ctrl)] != null ? p.pen_ctrl[String(d_ctrl)] : 0;
  if (d_ctrl === 2) flags.push("EC-AM-CTRL");
  if (d_ctrl === 3) flags.push("EC-RO");
  flags.push("EC-CRISIS"); // siempre en reporte; bandera informativa

  const S = clip(p.ra_peso * S_RA + p.pa_peso * S_PA + p.cap_constante - pen_cap - pen_ctrl);
  return {
    S,
    flags,
    detail: { S_RA, S_PA, pen_cap, pen_ctrl, d_cap, d_ctrl, CAP_A, CAP_B },
  };
}

function bandOf(I, rules) {
  if (I == null) return null;
  if (I >= rules.bands.alta_min) return "Alta";
  if (I >= rules.bands.media_min) return "Media";
  if (I >= rules.bands.reservada_min) return "Reservada";
  return "Baja";
}

/**
 * Índice de pareja a partir de perfiles ya puntuados (salida de scorePerson)
 * o de un objeto { bars, eco, aciertos, subBars }.
 */
function scorePairFromProfiles(profileA, profileB, rules) {
  const flags = [];
  const S = {};
  const presentA = profileA.present || {};
  const presentB = profileB.present || {};

  const absent = {};
  for (const d of ["V", "S", "H", "E", "L", "C"]) {
    const aAbs = profileA.bars && profileA.bars[d] == null
      ? true
      : presentA[d]
        ? domainAbsent(presentA, rules, d)
        : profileA.bars[d] == null;
    const bAbs = profileB.bars && profileB.bars[d] == null
      ? true
      : presentB[d]
        ? domainAbsent(presentB, rules, d)
        : profileB.bars[d] == null;
    absent[d] = aAbs || bAbs;
  }

  // Sin V o sin S: no hay índice
  if (absent.V || absent.S) {
    return {
      S,
      I: null,
      band: null,
      confidence: "none",
      flags: [...(profileA.flags || []), ...(profileB.flags || [])],
      blocked: (profileA.flags || []).includes("ATT-FAIL") || (profileB.flags || []).includes("ATT-FAIL"),
      absent,
      side_by_side_only: true,
    };
  }

  const vsh = (key, extra) => {
    if (absent[key]) {
      S[key] = null;
      return;
    }
    const r = scoreVSH(profileA.bars[key], profileB.bars[key], key, rules, extra);
    S[key] = r.S;
    flags.push(...r.flags);
  };

  vsh("V");
  vsh("S", {
    agrA: profileA.subBars && profileA.subBars.buen_manejo_agresion,
    agrB: profileB.subBars && profileB.subBars.buen_manejo_agresion,
    asertA: profileA.subBars && profileA.subBars.asertividad,
    asertB: profileB.subBars && profileB.subBars.asertividad,
    timA: profileA.subBars && profileA.subBars.buen_manejo_timidez,
    timB: profileB.subBars && profileB.subBars.buen_manejo_timidez,
  });
  vsh("H");

  if (!absent.L) {
    const r = scoreL(profileA.bars.L, profileB.bars.L, rules);
    S.L = r.S;
    flags.push(...r.flags);
  } else S.L = null;

  if (!absent.C) {
    const r = scoreC(profileA.aciertos, profileB.aciertos, profileA.bars.C, profileB.bars.C, rules);
    S.C = r.S;
    flags.push(...r.flags);
  } else S.C = null;

  if (!absent.E) {
    const r = scoreE(profileA.eco, profileB.eco, rules);
    S.E = r.S;
    flags.push(...r.flags);
  } else S.E = null;

  // Índice con renormalización F-15
  const w0 = rules.index_weights;
  const mandatoryOk = !absent.V && !absent.S;
  let confidence = "full";
  const used = {};
  let wSum = 0;
  for (const d of ["V", "S", "H", "E", "L", "C"]) {
    if (S[d] == null || absent[d]) continue;
    used[d] = w0[d];
    wSum += w0[d];
  }
  if (!mandatoryOk || wSum <= 0) {
    return {
      S,
      I: null,
      band: null,
      confidence: "none",
      flags: unique([...(profileA.flags || []), ...(profileB.flags || []), ...flags]),
      blocked: false,
      absent,
      side_by_side_only: true,
    };
  }
  if (Object.keys(used).length < 6) confidence = "parcial";

  let I = 0;
  for (const d of Object.keys(used)) I += (used[d] / wSum) * S[d];

  const allFlags = unique([...(profileA.flags || []), ...(profileB.flags || []), ...flags]);
  const redHit = rules.red_cap.flags.some((f) => allFlags.includes(f));
  if (redHit) I = Math.min(I, rules.red_cap.max_index);

  I = round2(I);
  const blocked = allFlags.includes("ATT-FAIL");

  return {
    S: {
      V: S.V != null ? round2(S.V) : null,
      S: S.S != null ? round2(S.S) : null,
      H: S.H != null ? round2(S.H) : null,
      E: S.E != null ? round2(S.E) : null,
      L: S.L != null ? round2(S.L) : null,
      C: S.C != null ? round2(S.C) : null,
    },
    I,
    band: bandOf(I, rules),
    confidence,
    flags: allFlags,
    blocked,
    absent,
    side_by_side_only: false,
    weights_used: used,
  };
}

function unique(arr) {
  return [...new Set(arr)];
}

function scorePair(answersA, answersB, opts = {}) {
  const rules = opts.rules || loadRules();
  const bank = opts.bank || loadBank();
  const profileA = scorePerson(answersA, bank, rules);
  const profileB = scorePerson(answersB, bank, rules);
  const pair = scorePairFromProfiles(profileA, profileB, rules);
  return { profileA, profileB, ...pair, rules_version: rules.rules_version };
}

module.exports = {
  loadRules,
  loadBank,
  clip,
  round2,
  likertV,
  evalVFormula,
  itemV,
  scorePerson,
  scoreVSH,
  scoreL,
  scoreC,
  scoreE,
  scorePairFromProfiles,
  scorePair,
  bandOf,
};
