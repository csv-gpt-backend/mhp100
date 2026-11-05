/**
 * ADALAM Match Capas (API) — Capa 1 + Capa 3 sobre match-engine local.
 * No modifica el producto MATCH.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const base = require("./match-engine");

function loadCapasRules() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "data", "plan50plus-capas.json"), "utf8"));
}

function loadBank() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "data", "match-bank.json"), "utf8"));
}

function bandOfComp(C, bands) {
  if (C == null) return null;
  if (C >= bands.alta_min) return "Alta";
  if (C >= bands.media_min) return "Media";
  if (C >= bands.reservada_min) return "Reservada";
  return "Baja";
}

function scoreDomainComplement(barA, barB, c3) {
  if (barA == null || barB == null) return { c: null, diff: false, vacio: true };
  const mn = Math.min(barA, barB);
  const mx = Math.max(barA, barB);
  const brecha = mx - mn;
  const clip = base.clip;

  if (mx < c3.piso_vacio) {
    return { c: 0, diff: false, vacio: true, detail: { mn, mx, brecha } };
  }

  let c;
  let diff = false;
  if (mx >= c3.piso_util && mn >= c3.min_sostiene) {
    const c_base = 0.55 * mx + 0.25 * mn + 0.2 * (100 - brecha);
    if (brecha >= c3.brecha_util_min && brecha <= c3.brecha_util_max) {
      c = clip(c_base + c3.premio_brecha_util);
      diff = true;
    } else if (brecha < c3.brecha_util_min) {
      c = clip(c_base);
    } else {
      c = clip(c_base - c3.pen_brecha_grande);
    }
  } else if (mx >= c3.piso_util && mn < c3.min_sostiene) {
    c = clip(0.7 * mx + 0.1 * mn - 5);
  } else {
    c = clip(0.5 * mx + 0.2 * mn);
  }

  return { c: base.round2(c), diff, vacio: false, detail: { mn, mx, brecha } };
}

function scoreComplement(profileA, profileB, rules) {
  const c3 = rules.capa3;
  const barsA = profileA.bars || {};
  const barsB = profileB.bars || {};
  const parts = {};
  const flags = [];

  for (const d of ["L", "C", "H"]) {
    parts[d] = scoreDomainComplement(barsA[d], barsB[d], c3);
  }

  const w = c3.weights;
  let acc = 0;
  let ws = 0;
  for (const d of ["L", "C", "H"]) {
    if (parts[d].c == null) continue;
    acc += w[d] * parts[d].c;
    ws += w[d];
  }
  const C_comp = ws > 0 ? base.round2(acc / ws) : null;
  const band = bandOfComp(C_comp, c3.bands);

  const maxL = Math.max(barsA.L == null ? -1 : barsA.L, barsB.L == null ? -1 : barsB.L);
  const maxH = Math.max(barsA.H == null ? -1 : barsA.H, barsB.H == null ? -1 : barsB.H);
  const anyVacioUtil =
    (parts.L && parts.L.vacio) ||
    (barsA.L != null && barsB.L != null && Math.max(barsA.L, barsB.L) < c3.piso_util) ||
    (barsA.C != null && barsB.C != null && Math.max(barsA.C, barsB.C) < c3.piso_util) ||
    (barsA.H != null && barsB.H != null && Math.max(barsA.H, barsB.H) < c3.piso_util);

  if (C_comp != null && C_comp < 45) flags.push("COMP-RO");
  else if (maxL >= 0 && maxH >= 0 && maxL < c3.piso_vacio && maxH < c3.piso_vacio) flags.push("COMP-RO");
  else if (C_comp != null && C_comp >= 60 && !anyVacioUtil) flags.push("COMP-OK");
  else if (C_comp != null && (C_comp < 60 || anyVacioUtil)) flags.push("COMP-AM");

  if (parts.L.diff || parts.H.diff) flags.push("COMP-DIFF");

  return {
    C_comp,
    band,
    c_L: parts.L.c,
    c_C: parts.C.c,
    c_H: parts.H.c,
    parts,
    flags: [...new Set(flags)],
  };
}

function classifyCapa1(flags, rules) {
  const c1 = rules.capa1;
  const set = new Set(flags || []);
  const vetos = c1.vetos.filter((f) => set.has(f));
  const notas = c1.notas.filter((f) => set.has(f));
  const blocked = c1.block_pair_on.some((f) => set.has(f));
  const no_apto = c1.apto_seal_vetos.some((f) => set.has(f));
  const texts = vetos.concat(notas.filter((n) => !vetos.includes(n))).map((code) => {
    const t = (c1.texts && c1.texts[code]) || { title: code, text: code, action: "nota" };
    return { code, ...t };
  });
  return { vetos, notas, blocked, no_apto, texts };
}

function comboText(I, C_comp, rules) {
  const bands = rules.bands;
  const c3 = rules.capa3;
  if (I == null || C_comp == null) return null;
  const iAlto = I >= bands.media_min;
  const cAlto = C_comp >= c3.bands.media_min;
  const map = c3.combo_texts;
  if (iAlto && cAlto) return map.I_alto_C_alto;
  if (iAlto && !cAlto) return map.I_alto_C_bajo;
  if (!iAlto && cAlto) return map.I_bajo_C_alto;
  return map.I_bajo_C_bajo;
}

function scorePairFromProfilesCapas(profileA, profileB, rules) {
  const rulesCapas = rules || loadCapasRules();
  const pair = base.scorePairFromProfiles(profileA, profileB, rulesCapas);
  const comp = scoreComplement(profileA, profileB, rulesCapas);
  const allFlags = [...new Set([...(pair.flags || []), ...(comp.flags || [])])];
  const capa1 = classifyCapa1(allFlags, rulesCapas);
  const blocked = pair.blocked || capa1.blocked;

  return {
    ...pair,
    flags: allFlags,
    blocked,
    C_comp: comp.C_comp,
    C_comp_band: comp.band,
    c_L: comp.c_L,
    c_C: comp.c_C,
    c_H: comp.c_H,
    capa3: comp,
    capa1,
    no_apto_socios: capa1.no_apto,
    combo_text: comboText(pair.I, comp.C_comp, rulesCapas),
    layers: {
      capa1: "no_negociables",
      capa2: "alineacion_I",
      capa3: "complemento_C_comp",
    },
    rules_version: rulesCapas.rules_version,
  };
}

function scorePairCapas(answersA, answersB, opts = {}) {
  const rules = opts.rules || loadCapasRules();
  const bank = opts.bank || loadBank();
  const profileA = base.scorePerson(answersA, bank, rules);
  const profileB = base.scorePerson(answersB, bank, rules);
  const pair = scorePairFromProfilesCapas(profileA, profileB, rules);
  return { profileA, profileB, ...pair };
}

module.exports = {
  loadCapasRules,
  loadBank,
  loadRules: loadCapasRules,
  scorePerson: base.scorePerson,
  scorePairFromProfiles: base.scorePairFromProfiles,
  scorePairFromProfilesCapas,
  scorePairCapas,
  scoreComplement,
  scoreDomainComplement,
  classifyCapa1,
  comboText,
  bandOfComp,
  clip: base.clip,
  round2: base.round2,
  bandOf: base.bandOf,
};
