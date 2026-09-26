const bank = require("./data/integr-bank.json");

const VALS = [11, 22, 33, 44, 56, 67, 78, 89, 100];
const CUTS_BY_SUB = {
  Rectitud: [10, 25, 45, 60, 70, 75, 80, 90],
  Honestidad: [10, 25, 45, 60, 70, 75, 85, 92],
  Justicia: [20, 40, 65, 72, 78, 84, 90, 95],
  Veracidad: [20, 40, 60, 72, 78, 84, 90, 95],
};

function mapPctToLexium(pct, sub) {
  const cuts = CUTS_BY_SUB[sub] || [4, 11, 23, 40, 60, 77, 89, 96];
  for (let i = 0; i < cuts.length; i++) {
    if (pct <= cuts[i]) return VALS[i];
  }
  return 100;
}

function valueOf(code, invertida) {
  const c = String(code || "").trim().toUpperCase();
  const inv = String(invertida || "").trim() === "Sí";
  if (c === "CS") return inv ? 1 : 3;
  if (c === "AV") return 2;
  if (c === "RV") return inv ? 3 : 1;
  return null;
}

function calcIV1_IV2_categories(items) {
  const direct = items.filter((q) => q.invertida === "No" && q.value != null).map((q) => q.value);
  const invers = items.filter((q) => q.invertida === "Sí" && q.value != null).map((q) => q.value);
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const stdev = (arr) => {
    if (arr.length < 2) return 1;
    const m = avg(arr);
    return Math.sqrt(arr.reduce((s, x) => s + (x - m) * (x - m), 0) / arr.length);
  };
  const invNorm = invers.map((v) => 4 - v);
  const allNorm = direct.concat(invNorm);
  if (!allNorm.length) return { iv1Cat: null, iv2Cat: null };
  const s = stdev(allNorm);
  const iv1Cat = s < 0.45 ? 0 : s < 0.9 ? 1 : 2;
  const diff = Math.abs(avg(direct) - avg(invNorm));
  const iv2Cat = diff < 0.4 ? 0 : diff < 0.9 ? 1 : 2;
  return { iv1Cat, iv2Cat };
}

function scoreIntegr(responses, startTime) {
  const items = bank.items || [];
  if (!responses || typeof responses !== "object" || !items.length) {
    return { ok: false, error: "Faltan respuestas." };
  }

  const scored = [];
  for (const it of items) {
    const value = valueOf(responses[String(it.id)], it.invertida);
    if (value == null) return { ok: false, error: "Faltan respuestas." };
    scored.push({
      id: it.id,
      bloque: it.bloque,
      subhabilidad: it.subhabilidad,
      invertida: it.invertida,
      value,
    });
  }

  const subMap = new Map();
  scored.forEach((q) => {
    if (!subMap.has(q.subhabilidad)) {
      subMap.set(q.subhabilidad, { bloque: q.bloque, items: 0, pts: 0 });
    }
    const s = subMap.get(q.subhabilidad);
    s.items += 1;
    s.pts += q.value ?? 0;
  });

  const subRows = Array.from(subMap.entries())
    .map(([sub, v]) => {
      const max = v.items * 3;
      const pct = max ? Math.round((v.pts / max) * 100) : 0;
      const pctLex = mapPctToLexium(pct, sub);
      return { bloque: v.bloque, sub, items: v.items, pts: v.pts, pct, pctLex };
    })
    .sort((a, b) => (a.sub || "").localeCompare(b.sub || ""));

  const ivBruto = subRows.length ? Math.round(subRows.reduce((s, r) => s + r.pct, 0) / subRows.length) : 0;
  const ivLex = subRows.length ? Math.round(subRows.reduce((s, r) => s + r.pctLex, 0) / subRows.length) : 0;
  const { iv1Cat, iv2Cat } = calcIV1_IV2_categories(scored);
  const inicio = Number(startTime) || Date.now();
  const mins = Math.round((Date.now() - inicio) / 60000);
  const iv3Cat = mins >= 20 && mins <= 30 ? 0 : mins < 20 ? 1 : 2;

  return {
    ok: true,
    resultados: {
      globales: {
        IVI: ivLex,
        IVI_BRUTO: ivBruto,
        IV1: iv1Cat ?? 0,
        IV2: iv2Cat ?? 0,
        IV3: iv3Cat,
        TIEMPO_MIN: mins,
      },
      subhabilidades: subRows,
    },
  };
}

module.exports = { scoreIntegr };
