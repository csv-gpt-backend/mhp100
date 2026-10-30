const bank = require("./data/vocac-bank.json");

function likertScore(code) {
  const c = String(code || "").trim().toUpperCase();
  if (c === "CS") return 3;
  if (c === "AV") return 2;
  if (c === "RV") return 1;
  const n = Number(code);
  if (n === 1 || n === 2 || n === 3) return n;
  return null;
}

function choiceABC(code) {
  const c = String(code || "").trim().toUpperCase();
  return c === "A" || c === "B" || c === "C" ? c : "";
}

function scoreVocac(responses, startTime, codigo) {
  const items = bank.items || [];
  const scenarioMap = bank.scenario_map || {};
  if (!responses || typeof responses !== "object" || !items.length) {
    return { ok: false, error: "Faltan respuestas." };
  }

  const riasec = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
  let visualOk = 0;
  let visualTotal = 0;
  let secuenciaOk = 0;
  let secuenciaTotal = 0;
  let relacionOk = 0;
  let relacionTotal = 0;
  const escenarios = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };

  for (const it of items) {
    const raw = responses[String(it.id)];
    if (it.tipo === "riasec") {
      const v = likertScore(raw);
      if (v == null) return { ok: false, error: "Faltan respuestas." };
      if (it.eje && riasec[it.eje] != null) riasec[it.eje] += v;
      continue;
    }

    const ans = choiceABC(raw);
    if (!ans) return { ok: false, error: "Faltan respuestas." };

    if (it.seccion === 2) {
      visualTotal += 1;
      if (ans === String(it.correcta || "").toUpperCase()) visualOk += 1;
    } else if (it.seccion === 3) {
      secuenciaTotal += 1;
      if (ans === String(it.correcta || "").toUpperCase()) secuenciaOk += 1;
    } else if (it.seccion === 4) {
      relacionTotal += 1;
      if (ans === String(it.correcta || "").toUpperCase()) relacionOk += 1;
    } else if (it.seccion === 5) {
      const map = scenarioMap[String(it.id)] || scenarioMap[it.id] || {};
      const eje = map[ans];
      if (eje && escenarios[eje] != null) escenarios[eje] += 1;
    }
  }

  const maxRiasec = 18;
  const riasec_pct = {};
  Object.keys(riasec).forEach((k) => {
    riasec_pct[k] = Math.round((riasec[k] / maxRiasec) * 100);
  });
  const orden = Object.entries(riasec).sort((a, b) => b[1] - a[1]);
  const codigoRiasec = orden.slice(0, 3).map(([k]) => k).join("");
  const perfil = String(codigo || "").toUpperCase().startsWith("PRO") ? "PRO" : "ESCOLAR";
  const mins = Math.max(
    1,
    Math.round((Date.now() - (Number(startTime) || Date.now())) / 60000)
  );

  return {
    ok: true,
    resultados: {
      prueba: "VOCACIONAL",
      resumen: {
        riasec_raw: riasec,
        riasec_pct,
        visual_correctas: visualOk,
        visual_total: visualTotal,
        visual_pct: visualTotal ? Math.round((visualOk / visualTotal) * 100) : 0,
        secuencia_correctas: secuenciaOk,
        secuencia_total: secuenciaTotal,
        secuencia_pct: secuenciaTotal
          ? Math.round((secuenciaOk / secuenciaTotal) * 100)
          : 0,
        relacion_correctas: relacionOk,
        relacion_total: relacionTotal,
        relacion_pct: relacionTotal
          ? Math.round((relacionOk / relacionTotal) * 100)
          : 0,
        codigo_riasec: codigoRiasec,
        total_items: items.length,
        minutos_aprox: mins,
      },
      escenarios,
      meta: {
        page_size: 10,
        version_banco: bank.version || "VOC-v1-banco-servidor",
        perfil,
      },
    },
  };
}

module.exports = { scoreVocac };
