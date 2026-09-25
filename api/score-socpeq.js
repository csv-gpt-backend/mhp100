const bank = require("./data/socpeq-bank.json");

const CHOICE = { A: 0, B: 1, C: 2 };

function scoreChoice(code, pts) {
  const i = CHOICE[String(code || "").trim().toUpperCase()];
  if (i == null || !Array.isArray(pts) || pts[i] == null) return null;
  const n = Number(pts[i]);
  return n === 1 || n === 2 || n === 3 ? n : null;
}

function calcIV1_IV2(items) {
  const vals = items.map((q) => q.value).filter((v) => v != null);
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const stdev = (arr) => {
    if (arr.length < 2) return 1;
    const m = avg(arr);
    return Math.sqrt(arr.reduce((s, x) => s + (x - m) * (x - m), 0) / arr.length);
  };
  if (!vals.length) return { iv1Cat: null, iv2Cat: null };
  const s = stdev(vals);
  const iv1Cat = s < 0.45 ? 0 : s < 0.9 ? 1 : 2;

  const bySub = new Map();
  items.forEach((q) => {
    if (q.value == null) return;
    if (!bySub.has(q.subhabilidad)) bySub.set(q.subhabilidad, []);
    bySub.get(q.subhabilidad).push(q.value);
  });
  const diffs = [];
  bySub.forEach((arr) => {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) diffs.push(Math.abs(arr[i] - arr[j]));
    }
  });
  const meanDiff = diffs.length ? avg(diffs) : 0;
  const iv2Cat = meanDiff < 0.5 ? 0 : meanDiff < 1.0 ? 1 : 2;
  return { iv1Cat, iv2Cat };
}

function calcIV3(startTime) {
  const start = Number(startTime) || Date.now();
  const mins = Math.round((Date.now() - start) / 60000);
  if (mins >= 6 && mins <= 25) return 0;
  if (mins >= 3 && mins <= 5) return 1;
  if (mins > 40) return 2;
  if (mins < 3) return 2;
  return 1;
}

function scoreSocpeq(responses, startTime) {
  const resp = responses && typeof responses === "object" ? responses : {};
  const items = (bank.items || []).map((it) => ({
    id: it.id,
    bloque: it.bloq,
    subhabilidad: it.sub,
    value: scoreChoice(resp[String(it.id)], it.pts),
  }));

  if (!items.length || items.some((it) => it.value == null)) {
    return { ok: false, error: "Faltan respuestas." };
  }

  const subMap = new Map();
  items.forEach((q) => {
    if (!subMap.has(q.subhabilidad)) {
      subMap.set(q.subhabilidad, { bloque: q.bloque, items: 0, pts: 0 });
    }
    const s = subMap.get(q.subhabilidad);
    s.items += 1;
    s.pts += q.value;
  });

  const subhabilidades = Array.from(subMap.entries()).map(([sub, v]) => {
    const max = v.items * 3;
    const pct = max ? Math.round((v.pts / max) * 100) : 0;
    return { bloque: v.bloque, subhabilidad: sub, sub, items: v.items, pts: v.pts, pct };
  });

  const bloqMap = new Map();
  subhabilidades.forEach((r) => {
    if (!bloqMap.has(r.bloque)) bloqMap.set(r.bloque, { sum: 0, n: 0 });
    const b = bloqMap.get(r.bloque);
    b.sum += r.pct;
    b.n += 1;
  });

  const bloqPercents = {};
  bloqMap.forEach((a, bloque) => {
    bloqPercents[bloque] = a.n ? Math.round(a.sum / a.n) : 0;
  });

  function pct(name) {
    const k = Object.keys(bloqPercents).find((x) => x.toLowerCase() === name.toLowerCase());
    return k ? bloqPercents[k] : 0;
  }

  const bIntra = pct("Habilidades intrapersonales");
  const bInter = pct("Habilidades interpersonales");
  const bPV = pct("Habilidades para la vida");
  const iie = Math.round((bIntra + bInter + bPV) / 3) || 0;
  const { iv1Cat, iv2Cat } = calcIV1_IV2(items);

  return {
    ok: true,
    resultados: {
      globales: { IIE: iie, IV1: iv1Cat, IV2: iv2Cat, IV3: calcIV3(startTime) },
      bloques: {
        intrapersonales: bIntra,
        interpersonales: bInter,
        para_la_vida: bPV,
        estilos_comunicacion: pct("Estilos de comunicación interpersonal"),
        propension_cambio: pct("Propensión al cambio"),
      },
      subhabilidades,
      bloqPercents,
    },
  };
}

module.exports = { scoreSocpeq };
