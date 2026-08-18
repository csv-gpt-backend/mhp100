/** Claves oficiales de evaluación (6 letras, mismo criterio que alta-codigos). */
const EVAL_CATALOG = [
  { key: "INTELC", label: "Intelectual", labelEn: "Intellectual", aliases: ["INTELECTUAL", "INTEL", "INTE"] },
  { key: "INTEGR", label: "Integridad", labelEn: "Integrity", aliases: ["INTEGRIDAD", "VALORES", "INTG"] },
  { key: "SOCIOE", label: "Socioemocional", labelEn: "Social-emotional", aliases: ["SOCIOEMOCIONAL", "SOCIO", "SOC"] },
  { key: "LIDERA", label: "Liderazgo", labelEn: "Leadership", aliases: ["LIDERAZGO", "LIDER", "LIDE", "LID"] },
  { key: "HABITO", label: "Hábitos", labelEn: "Habits", aliases: ["HABITOS", "HABIT", "HAB"] },
  { key: "APREND", label: "Aprendizaje", labelEn: "Learning", aliases: ["APRENDIZAJE", "APREN", "APR"] },
  { key: "VOCACI", label: "Vocacional", labelEn: "Career", aliases: ["VOCACIONAL", "VOCAC", "VOC"] },
];

const EVAL_KEYS = new Set(EVAL_CATALOG.map((e) => e.key));

function matchEvalToken(token) {
  const t = String(token || "").trim().toUpperCase();
  if (!t) return null;
  for (const e of EVAL_CATALOG) {
    if (t === e.key || e.aliases.includes(t)) return e;
  }
  return null;
}

function parseEvalKeyFromCodigo(codigoRaw) {
  const codigo = String(codigoRaw || "").trim().toUpperCase();
  if (!codigo) return "";

  const parts = codigo.split("-").filter(Boolean);
  if (parts.length >= 2 && (parts[0] === "ESC" || parts[0] === "PRO")) {
    const hit = matchEvalToken(parts[1]);
    if (hit) return hit.key;
    if (/^[A-Z]{4,8}$/.test(parts[1])) return parts[1];
  }

  const needles = [];
  EVAL_CATALOG.forEach((e) => {
    needles.push({ key: e.key, token: e.key });
    e.aliases.forEach((a) => needles.push({ key: e.key, token: a }));
  });
  needles.sort((a, b) => b.token.length - a.token.length);
  for (const n of needles) {
    if (codigo.includes(n.token)) return n.key;
  }
  return "";
}

function evalLabelEs(key) {
  const k = String(key || "").trim().toUpperCase();
  const hit = EVAL_CATALOG.find((e) => e.key === k);
  return hit ? hit.label : k || "—";
}

function evalLabelEn(key) {
  const k = String(key || "").trim().toUpperCase();
  const hit = EVAL_CATALOG.find((e) => e.key === k);
  return hit ? hit.labelEn : k || "—";
}

function normalizeEvalKey(raw) {
  const k = String(raw || "").trim().toUpperCase();
  if (!k || !EVAL_KEYS.has(k)) return "";
  return k;
}

function normalizeIdioma(raw) {
  const k = String(raw || "").trim().toUpperCase();
  if (k === "EN" || k === "ENG" || k === "ENGLISH" || k === "US") return "EN";
  if (k === "ES" || k === "ESP" || k === "SPANISH" || k === "ESPAÑOL") return "ES";
  return "";
}

function parseIdiomaFromCodigo(codigoRaw) {
  const codigo = String(codigoRaw || "").trim().toUpperCase();
  const parts = codigo.split("-").filter(Boolean);
  if (parts.length >= 3 && (parts[0] === "ESC" || parts[0] === "PRO")) {
    if (parts[2] === "EN" || parts[2] === "ES") return parts[2];
  }
  if (/(^|-)EN(-|$)/.test(codigo) && /-(EN)-/.test(codigo)) return "EN";
  return "ES";
}

function resolveEvalKey(codigo, participantRow) {
  const fromDb = normalizeEvalKey(participantRow && participantRow.evaluacion);
  if (fromDb) return fromDb;
  return normalizeEvalKey(parseEvalKeyFromCodigo(codigo)) || parseEvalKeyFromCodigo(codigo);
}

function resolveIdioma(codigo, participantRow) {
  const fromDb = normalizeIdioma(participantRow && (participantRow.idioma || participantRow.lang));
  if (fromDb) return fromDb;
  return parseIdiomaFromCodigo(codigo);
}

function validateCodigoEval(codigo, expectedEval, participantRow) {
  const expected = normalizeEvalKey(expectedEval);
  if (!expected) return { ok: true, skipped: true };

  const resolved = resolveEvalKey(codigo, participantRow);
  if (!resolved) return { ok: true, skipped: true, reason: "unknown_eval_on_code" };

  if (resolved !== expected) {
    return {
      ok: false,
      eval_codigo: resolved,
      eval_esperada: expected,
      eval_label_codigo: evalLabelEs(resolved),
      eval_label_esperada: evalLabelEs(expected),
      eval_label_codigo_en: evalLabelEn(resolved),
      eval_label_esperada_en: evalLabelEn(expected),
    };
  }
  return { ok: true, eval_key: resolved };
}

function validateCodigoIdioma(codigo, expectedIdioma, participantRow) {
  const expected = normalizeIdioma(expectedIdioma);
  if (!expected) return { ok: true, skipped: true };

  const resolved = resolveIdioma(codigo, participantRow);
  if (resolved !== expected) {
    return {
      ok: false,
      idioma_codigo: resolved,
      idioma_esperada: expected,
    };
  }
  return { ok: true, idioma: resolved };
}

function pageLang(raw) {
  return normalizeIdioma(raw) || "ES";
}

function mismatchErrorMessage(v, lang) {
  const L = pageLang(lang);
  if (L === "EN") {
    return (
      "This code belongs to the «" +
      (v.eval_label_codigo_en || v.eval_label_codigo) +
      "» assessment, not «" +
      (v.eval_label_esperada_en || v.eval_label_esperada) +
      "». Open the correct assessment from the English portal."
    );
  }
  return (
    "Este código corresponde a la evaluación «" +
    v.eval_label_codigo +
    "», no a «" +
    v.eval_label_esperada +
    "». Abra la evaluación correcta desde el portal."
  );
}

function idiomaMismatchMessage(v, lang) {
  const L = pageLang(lang);
  const codeLang = v.idioma_codigo;
  if (L === "EN") {
    return codeLang === "ES"
      ? "This code is for the Spanish assessment, not the English one. Use the Spanish link."
      : "This code does not match this language. Use the matching portal.";
  }
  return codeLang === "EN"
    ? "Este código corresponde a la evaluación en inglés, no a la de español. Use el enlace en inglés."
    : "Este código no corresponde a este idioma. Use el portal correcto.";
}

module.exports = {
  EVAL_KEYS,
  parseEvalKeyFromCodigo,
  parseIdiomaFromCodigo,
  resolveEvalKey,
  resolveIdioma,
  validateCodigoEval,
  validateCodigoIdioma,
  evalLabelEs,
  evalLabelEn,
  mismatchErrorMessage,
  idiomaMismatchMessage,
  normalizeIdioma,
};
