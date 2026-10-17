const bank = require("./data/habito-bank.json");

function isInv(inv) {
  return String(inv || "").trim() === "Sí";
}

function scoreChoice(code, inv) {
  const c = String(code || "").trim().toUpperCase();
  if (c === "CS") return inv ? 1 : 3;
  if (c === "AV") return 2;
  if (c === "RV") return inv ? 3 : 1;
  return null;
}

function pctToOldNorm(pctRaw) {
  const anchorRaw = 84;
  const anchorOut = 63;
  let out;
  if (pctRaw <= anchorRaw) {
    out = Math.round((pctRaw / anchorRaw) * anchorOut);
  } else {
    out = Math.round(
      anchorOut + ((pctRaw - anchorRaw) / (100 - anchorRaw)) * (100 - anchorOut)
    );
  }
  if (out < 0) out = 0;
  if (out > 100) out = 100;
  return out;
}

function scoreHabito(responses, startTime, codigo) {
  const itemsBank = bank.items || [];
  if (!responses || typeof responses !== "object" || !itemsBank.length) {
    return { ok: false, error: "Faltan respuestas." };
  }

  const scored = [];
  for (const it of itemsBank) {
    const inv = isInv(it.invertida);
    const value = scoreChoice(responses[String(it.id)], inv);
    if (value == null) return { ok: false, error: "Faltan respuestas." };
    scored.push({
      id: it.id,
      bloque: it.bloque,
      subhabilidad: it.subhabilidad,
      invertida: it.invertida,
      value,
    });
  }

  const perfil = String(codigo || "").toUpperCase().startsWith("PRO") ? "PRO" : "ESCOLAR";

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
      const pct_raw = max ? Math.round((v.pts / max) * 100) : 0;
      const pct = pctToOldNorm(pct_raw);
      return { bloque: v.bloque, sub, items: v.items, pts: v.pts, pct, pct_raw };
    })
    .sort(
      (a, b) =>
        (a.bloque || "").localeCompare(b.bloque || "") ||
        (a.sub || "").localeCompare(b.sub || "")
    );

  const bloqMap = new Map();
  subRows.forEach((r) => {
    if (!bloqMap.has(r.bloque)) bloqMap.set(r.bloque, { sumPct: 0, n: 0, pts: 0, items: 0 });
    const b = bloqMap.get(r.bloque);
    b.sumPct += r.pct;
    b.n += 1;
    b.pts += r.pts;
    b.items += r.items;
  });

  const bloqPercents = {};
  const bloques = {};
  Array.from(bloqMap.entries()).forEach(([bloque, a]) => {
    const pct = a.n ? Math.round(a.sumPct / a.n) : 0;
    bloqPercents[bloque] = pct;
    bloques[bloque] = { pct, pts: a.pts, items: a.items, max: a.items * 3 };
  });

  const totalItems = scored.length;
  const totalPts = scored.reduce((acc, q) => acc + (q.value ?? 0), 0);
  const totalMax = totalItems * 3;
  const totalPct_raw = totalMax ? Math.round((totalPts / totalMax) * 100) : 0;
  const totalPct = pctToOldNorm(totalPct_raw);
  const directCount = scored.filter((q) => q.invertida === "No").length;
  const invertidasCount = scored.filter((q) => q.invertida === "Sí").length;
  const mins = Math.round((Date.now() - (Number(startTime) || Date.now())) / 60000);

  return {
    ok: true,
    resultados: {
      prueba: "Habitos",
      resumen: {
        total_items: totalItems,
        total_puntos: totalPts,
        total_max: totalMax,
        total_pct: totalPct,
        total_pct_raw: totalPct_raw,
      },
      bloques,
      bloqPercents,
      subhabilidades: subRows,
      meta: {
        page_size: 10,
        escala: { SIEMPRE: 3, "ALGUNAS VECES": 2, "RARA VEZ": 1 },
        conteo_invertidas: invertidasCount,
        conteo_directas: directCount,
        minutos_aprox: mins,
        perfil,
      },
    },
  };
}

module.exports = { scoreHabito };
