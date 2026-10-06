const bankEs = require("./data/intel-bank.json");
const bankEn = require("./data/intel-bank-en.json");

const LABELS = {
  ES: {
    Gf: "Razonamiento fluido",
    Gc: "Conocimiento verbal",
    Gwm: "Memoria de trabajo",
    Gs: "Velocidad",
    Gv: "Visual-espacial",
    Glr: "Memoria asociativa",
    Gq: "Razonamiento cuantitativo",
  },
  EN: {
    Gf: "Fluid reasoning",
    Gc: "Verbal knowledge",
    Gwm: "Working memory",
    Gs: "Processing speed",
    Gv: "Visual-spatial",
    Glr: "Associative memory",
    Gq: "Quantitative reasoning",
  },
};

function bankFor(lang) {
  return lang === "EN" ? bankEn : bankEs;
}

function isHit(it, answers) {
  const a = answers[it.id];
  if (a == null || a === "") return false;
  return String(a) === String(it.correct);
}

function countHits(list, answers) {
  let n = 0;
  (list || []).forEach(function (it) {
    if (isHit(it, answers)) n++;
  });
  return { score: n, max: (list || []).length };
}

function scoreIntel(responses, lang, meta) {
  const answers = responses && typeof responses === "object" ? responses : null;
  if (!answers) {
    return { ok: false, error: lang === "EN" ? "Some answers are missing." : "Faltan respuestas." };
  }

  const bank = bankFor(lang === "EN" ? "EN" : "ES");
  const labels = LABELS[lang === "EN" ? "EN" : "ES"];
  const items = bank.items || {};
  const gf = countHits(items.gf, answers);
  const gc = countHits(items.gc, answers);
  const gv = countHits(items.gv, answers);
  const glr = countHits(items.glr, answers);
  const gq = countHits(items.gq, answers);

  const gwmList = bank.gwm || [];
  let gwmN = 0;
  gwmList.forEach(function (t) {
    if (String(answers[t.id]) === "1") gwmN++;
  });
  const gwm = { score: gwmN, max: gwmList.length };

  const gsItems = bank.gsItems || [];
  const gsTarget = bank.gsTarget;
  const gsMax = gsItems.filter(function (c) { return c.sym === gsTarget; }).length;
  const gsParsed = parseInt(answers.gs_score, 10);
  const gs = { score: Number.isFinite(gsParsed) ? gsParsed : 0, max: gsMax };

  const rows = [
    { code: "Gf", label: labels.Gf, score: gf.score, max: gf.max },
    { code: "Gc", label: labels.Gc, score: gc.score, max: gc.max },
    { code: "Gwm", label: labels.Gwm, score: gwm.score, max: gwm.max },
    { code: "Gs", label: labels.Gs, score: gs.score, max: gs.max },
    { code: "Gv", label: labels.Gv, score: gv.score, max: gv.max },
    { code: "Glr", label: labels.Glr, score: glr.score, max: glr.max },
    { code: "Gq", label: labels.Gq, score: gq.score, max: gq.max },
  ];

  let sumS = 0;
  let sumM = 0;
  rows.forEach(function (r) {
    sumS += r.score;
    sumM += r.max;
    r.pct = r.max ? Math.round((r.score / r.max) * 100) : 0;
  });
  const totalPct = sumM ? Math.round((sumS / sumM) * 100) : 0;
  const minsRaw = meta && meta.minutos_aprox;
  const mins = Number.isFinite(Number(minsRaw)) ? Math.round(Number(minsRaw)) : null;

  return {
    ok: true,
    resultados: {
      prueba: "Intelectual_CHC",
      modelo: "CHC",
      version_banco: bank.version || "CHC-v2.9.2",
      meta: { minutos_aprox: mins, items_total: sumM },
      globales: {},
      bloques: {},
      factores: rows,
      total: { puntos: sumS, max: sumM, pct: totalPct },
    },
  };
}

function publicBank(lang) {
  const bank = bankFor(lang === "EN" ? "EN" : "ES");
  const items = {};
  Object.keys(bank.items || {}).forEach(function (key) {
    items[key] = (bank.items[key] || []).map(function (it) {
      const copy = Object.assign({}, it);
      delete copy.correct;
      return copy;
    });
  });
  return {
    ok: true,
    version: bank.version || "CHC-v2.9.2",
    items: items,
    gwm: bank.gwm || [],
    gsTarget: bank.gsTarget,
    gsItems: bank.gsItems || [],
  };
}

module.exports = { scoreIntel, publicBank };
