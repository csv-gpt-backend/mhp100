const bank = require("./data/aprend-bank.json");

const MATRIX = {
  areas: {
    perceptuales: { label: "Preferencias perceptuales" },
    interaccion: { label: "Preferencias de interacción" },
    comunicacion: { label: "Preferencias de comunicación" },
  },
  componentes: {
    lenguaje_visual: { area: "perceptuales", label: "Lenguaje visual" },
    numerico_visual: { area: "perceptuales", label: "Numérico visual" },
    lenguaje_auditivo: { area: "perceptuales", label: "Lenguaje auditivo" },
    numerico_auditivo: { area: "perceptuales", label: "Numérico auditivo" },
    kinestesico: { area: "perceptuales", label: "Kinestésico" },
    individual: { area: "interaccion", label: "Individual" },
    equipo: { area: "interaccion", label: "En equipo" },
    oral: { area: "comunicacion", label: "Oral" },
    escrito: { area: "comunicacion", label: "Escrito" },
  },
};

const RAW_TO_PCT = {
  5: 0,
  6: 3,
  7: 9,
  8: 21,
  9: 40,
  10: 61,
  11: 79,
  12: 91,
  13: 97,
  14: 99,
  15: 100,
};

function rawToPctMPA(raw) {
  if (raw == null || Number.isNaN(raw)) return 0;
  const key = Math.round(Number(raw));
  if (RAW_TO_PCT[key] != null) return RAW_TO_PCT[key];
  const min = 5;
  const max = 15;
  return Math.round(((Number(raw) - min) / (max - min)) * 100);
}

function rangoMPA(pct) {
  if (pct <= 40) return "Preferencia baja";
  if (pct <= 70) return "Preferencia media";
  return "Preferencia alta";
}

function scoreOf(code) {
  const c = String(code || "").trim().toUpperCase();
  if (c === "MO") return 3;
  if (c === "AO") return 2;
  if (c === "NM") return 1;
  return null;
}

function scoreAprend(responses, startTime, codigo) {
  const items = bank.items || [];
  if (!responses || typeof responses !== "object" || !items.length) {
    return { ok: false, error: "Faltan respuestas." };
  }

  const scored = [];
  for (const it of items) {
    const value = scoreOf(responses[String(it.item)]);
    if (value == null) return { ok: false, error: "Faltan respuestas." };
    scored.push({
      id: it.item,
      area: it.area,
      componente: it.componente,
      value,
    });
  }

  const totalItems = scored.length;
  const totalPts = scored.reduce((acc, q) => acc + (q.value ?? 0), 0);
  const totalMax = totalItems * 3;

  const componentes = {};
  Object.entries(MATRIX.componentes).forEach(([key, comp]) => {
    const qs = scored.filter((q) => q.componente === key);
    const raw = qs.reduce((acc, q) => acc + Number(q.value || 0), 0);
    const pct = rawToPctMPA(raw);
    componentes[key] = {
      area: comp.area,
      label: comp.label,
      raw,
      pct,
      rango: rangoMPA(pct),
      total_items: qs.length,
    };
  });

  const areas = {};
  Object.entries(MATRIX.areas).forEach(([areaKey, areaObj]) => {
    const comps = Object.entries(componentes)
      .filter(([, c]) => c.area === areaKey)
      .map(([, c]) => c);
    const raw = comps.length
      ? Number((comps.reduce((acc, c) => acc + c.raw, 0) / comps.length).toFixed(2))
      : 0;
    const pct = comps.length
      ? Math.round(comps.reduce((acc, c) => acc + c.pct, 0) / comps.length)
      : 0;
    areas[areaKey] = {
      label: areaObj.label,
      raw,
      pct,
      rango: rangoMPA(pct),
      total_componentes: comps.length,
    };
  });

  const compsOrdenados = Object.entries(componentes).sort((a, b) => b[1].pct - a[1].pct);
  const areasOrdenadas = Object.entries(areas).sort((a, b) => b[1].pct - a[1].pct);
  const perfil = String(codigo || "").toUpperCase().startsWith("PRO") ? "PRO" : "ESCOLAR";
  const inicio = Number(startTime) || Date.now();

  return {
    ok: true,
    resultados: {
      prueba: "MPA",
      resumen: {
        total_items: totalItems,
        total_puntos: totalPts,
        total_max: totalMax,
      },
      areas,
      componentes,
      meta: {
        page_size: 10,
        escala: {
          MAYORIA_OCASIONES: 3,
          ALGUNAS_OCASIONES: 2,
          NINGUNA_O_MINIMAS_OCASIONES: 1,
        },
        minutos_aprox: Math.round((Date.now() - inicio) / 60000),
        perfil,
      },
      resumen_preferencias: {
        dominante_area: areasOrdenadas[0]?.[0] || "",
        dominante_componente: compsOrdenados[0]?.[0] || "",
        secundaria_componente: compsOrdenados[1]?.[0] || "",
      },
    },
  };
}

module.exports = { scoreAprend };
