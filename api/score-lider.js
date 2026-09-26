const bank = require("./data/lider-bank.json");

function valueOf(code, invertida) {
  const c = String(code || "").trim().toUpperCase();
  const inv = String(invertida || "").trim() === "Sí";
  if (c === "CS") return inv ? 1 : 3;
  if (c === "AV") return 2;
  if (c === "RV") return inv ? 3 : 1;
  return null;
}

function normalizeBloqueName(name) {
  if (!name) return "";
  return name.replace(/\s+/g, " ").trim().toLowerCase();
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

function pctToOldDecile(pct) {
  const x = Number(pct);
  if (!isFinite(x)) return 10;
  if (x <= 0) return 10;
  return Math.max(10, Math.min(100, Math.round(x / 10) * 10));
}

function interpKnots(raw, knots) {
  const x = Number(raw);
  if (!isFinite(x)) return 0;
  if (!Array.isArray(knots) || knots.length < 2) return Math.max(0, Math.min(100, Math.round(x)));
  if (x <= knots[0].raw) return knots[0].out;
  for (let i = 0; i < knots.length - 1; i++) {
    const a = knots[i], b = knots[i + 1];
    if (x <= b.raw) {
      const t = (x - a.raw) / (b.raw - a.raw || 1);
      const y = a.out + t * (b.out - a.out);
      return Math.max(0, Math.min(100, Math.round(y)));
    }
  }
  return knots[knots.length - 1].out;
}

function pctOldFineByBloque(pctRaw, bloque) {
  const b = String(bloque || "").toUpperCase().trim();
  const x = Number(pctRaw);
  if (!isFinite(x)) return 0;

  const baseKnots = [
    { raw: 0, out: 10 },
    { raw: 35, out: 10 },
    { raw: 45, out: 20 },
    { raw: 55, out: 30 },
    { raw: 65, out: 40 },
    { raw: 75, out: 50 },
    { raw: 82, out: 60 },
    { raw: 88, out: 70 },
    { raw: 93, out: 80 },
    { raw: 97, out: 90 },
    { raw: 100, out: 100 },
  ];

  const bKnots = [
    { raw: 0, out: 10 },
    { raw: 55, out: 10 },
    { raw: 65, out: 20 },
    { raw: 75, out: 30 },
    { raw: 85, out: 40 },
    { raw: 93, out: 50 },
    { raw: 97, out: 60 },
    { raw: 100, out: 100 },
  ];

  let y = (b === "B") ? interpKnots(x, bKnots) : interpKnots(x, baseKnots);

  const ajustes = { A: 4, B: 5, C: 1, D: 2 };
  const pivotes = { A: 52, B: 48, C: 54, D: 54 };
  const compresion = { A: 0.96, B: 0.92, C: 0.90, D: 0.90 };

  const pivot = pivotes[b] ?? 52;
  const scale = compresion[b] ?? 0.94;
  const shift = ajustes[b] ?? 0;

  y = pivot + ((y - pivot) * scale) + shift;
  return Math.max(0, Math.min(100, Math.round(y)));
}

function pctToOldDecileByBloque(pct, bloque) {
  return pctToOldDecile(pctOldFineByBloque(pct, bloque));
}

function scoreFromItems(items, startTime) {
  const subMap = new Map();
  items.forEach((q) => {
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
      const pct10_decile = pctToOldDecileByBloque(pct, v.bloque);
      const pct10 = pctOldFineByBloque(pct, v.bloque);
      return { bloque: v.bloque, sub, items: v.items, pts: v.pts, pct, pct10, pct10_decile };
    })
    .sort(
      (a, b) =>
        (a.bloque || "").localeCompare(b.bloque || "") ||
        (a.sub || "").localeCompare(b.sub || "")
    );

  const bloqMap = new Map();
  subRows.forEach((r) => {
    if (!bloqMap.has(r.bloque)) bloqMap.set(r.bloque, { sumPct: 0, n: 0 });
    const b = bloqMap.get(r.bloque);
    b.sumPct += r.pct;
    b.n += 1;
  });

  const bloqPercentsRaw = {};
  Array.from(bloqMap.entries()).forEach(([bloque, a]) => {
    const pct = a.n ? Math.round(a.sumPct / a.n) : 0;
    bloqPercentsRaw[bloque] = pct;
  });

  const bloqMap10 = new Map();
  subRows.forEach((r) => {
    if (!bloqMap10.has(r.bloque)) bloqMap10.set(r.bloque, { sum: 0, n: 0 });
    const b = bloqMap10.get(r.bloque);
    b.sum += Number(r.pct10) || 0;
    b.n += 1;
  });
  const bloqPercents = {};
  Array.from(bloqMap10.entries()).forEach(([bloque, a]) => {
    const pct = a.n ? Math.round(a.sum / a.n) : 0;
    bloqPercents[bloque] = pct;
  });

  function pctBloque(nombreEsperado) {
    const key = Object.keys(bloqPercents).find(
      (k) => normalizeBloqueName(k) === normalizeBloqueName(nombreEsperado)
    );
    return key ? bloqPercents[key] : 0;
  }

  const bIntra = pctBloque("Habilidades intrapersonales");
  const bInter = pctBloque("Habilidades interpersonales");
  const bPV = pctBloque("Habilidades para la vida");
  const iie =
    [bIntra, bInter, bPV].filter((v) => v > 0).length > 0
      ? Math.round((bIntra + bInter + bPV) / 3)
      : 0;

  const { iv1Cat, iv2Cat } = calcIV1_IV2_categories(items);

  const mins = Math.round((Date.now() - (Number(startTime) || Date.now())) / 60000);
  const iv3Cat = mins >= 18 && mins <= 30 ? 0 : mins < 18 ? 1 : 2;

  const bEstilos = pctBloque("Estilos de comunicación interpersonal");
  const bCambio = pctBloque("Propensión al cambio");

  return {
    globales: { IIE: iie, IV1: iv1Cat, IV2: iv2Cat, IV3: iv3Cat },
    bloques: {
      intrapersonales: bIntra,
      interpersonales: bInter,
      para_la_vida: bPV,
      estilos_comunicacion: bEstilos,
      propension_cambio: bCambio,
    },
    subhabilidades: subRows,
    bloqPercents,
    bloqPercentsRaw,
  };
}

function scoreLider(responses, startTime) {
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

  return { ok: true, resultados: scoreFromItems(scored, startTime) };
}

module.exports = { scoreLider, valueOf, scoreFromItems };
