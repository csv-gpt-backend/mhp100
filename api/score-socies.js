const bank = require("./data/sociesc-bank.json");

function isInv(inv) {
  return /^s(i|í)$/i.test(String(inv || "").trim());
}

function scoreChoice(code, inv) {
  const c = String(code || "").trim().toUpperCase();
  if (c === "CS") return inv ? 1 : 3;
  if (c === "AV") return 2;
  if (c === "RV") return inv ? 3 : 1;
  return null;
}

function normalizeBloqueName(name) {
  if (!name) return "";
  return String(name).replace(/\s+/g, " ").trim().toLowerCase();
}

function calcIV1_IV2(items) {
  const direct = items.filter((q) => !q.invFlag && q.value != null).map((q) => q.value);
  const invers = items.filter((q) => q.invFlag && q.value != null).map((q) => q.value);
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

function scoreSocies(responses, startTime) {
  const resp = responses && typeof responses === "object" ? responses : {};
  const items = (bank.items || []).map((it) => {
    const invFlag = isInv(it.inv);
    const value = scoreChoice(resp[String(it.id)], invFlag);
    return {
      id: it.id,
      bloque: it.bloq,
      subhabilidad: it.sub,
      invFlag,
      value,
    };
  });

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
    s.pts += q.value ?? 0;
  });

  const subRows = Array.from(subMap.entries())
    .map(([sub, v]) => {
      const max = v.items * 3;
      const pct = max ? Math.round((v.pts / max) * 100) : 0;
      return { bloque: v.bloque, sub, items: v.items, pts: v.pts, pct };
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

  const bloqPercents = {};
  Array.from(bloqMap.entries()).forEach(([bloque, a]) => {
    bloqPercents[bloque] = a.n ? Math.round(a.sumPct / a.n) : 0;
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

  const { iv1Cat, iv2Cat } = calcIV1_IV2(items);
  const start = Number(startTime) || Date.now();
  const mins = Math.round((Date.now() - start) / 60000);
  const iv3Cat =
    mins >= 30 && mins <= 90 ? 0 : mins >= 10 && mins <= 20 ? 1 : mins > 90 ? 2 : 1;

  return {
    ok: true,
    resultados: {
      globales: { IIE: iie, IV1: iv1Cat, IV2: iv2Cat, IV3: iv3Cat },
      bloques: {
        intrapersonales: bIntra,
        interpersonales: bInter,
        para_la_vida: bPV,
        estilos_comunicacion: pctBloque("Estilos de comunicación interpersonal"),
        propension_cambio: pctBloque("Propensión al cambio"),
      },
      subhabilidades: subRows,
      bloqPercents,
    },
  };
}

module.exports = { scoreSocies };
