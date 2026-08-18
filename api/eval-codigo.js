/** Claves oficiales de evaluación (6 letras, mismo criterio que alta-codigos). */
const EVAL_CATALOG = [
  { key: "INTELC", label: "Intelectual", aliases: ["INTELECTUAL", "INTEL", "INTE"] },
  { key: "INTEGR", label: "Integridad", aliases: ["INTEGRIDAD", "VALORES", "INTG"] },
  { key: "SOCIOE", label: "Socioemocional", aliases: ["SOCIOEMOCIONAL", "SOCIO", "SOC"] },
  { key: "LIDERA", label: "Liderazgo", aliases: ["LIDERAZGO", "LIDER", "LIDE", "LID"] },
  { key: "HABITO", label: "Hábitos", aliases: ["HABITOS", "HABIT", "HAB"] },
  { key: "APREND", label: "Aprendizaje", aliases: ["APRENDIZAJE", "APREN", "APR"] },
  { key: "VOCACI", label: "Vocacional", aliases: ["VOCACIONAL", "VOCAC", "VOC"] },
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

function normalizeEvalKey(raw) {
  const k = String(raw || "").trim().toUpperCase();
  if (!k || !EVAL_KEYS.has(k)) return "";
  return k;
}

function resolveEvalKey(codigo, participantRow) {
  const fromDb = normalizeEvalKey(participantRow && participantRow.evaluacion);
  if (fromDb) return fromDb;
  return normalizeEvalKey(parseEvalKeyFromCodigo(codigo)) || parseEvalKeyFromCodigo(codigo);
}

/**
 * @returns {{ ok: true, eval_key?: string, skipped?: boolean } | { ok: false, eval_codigo: string, eval_esperada: string, eval_label_codigo: string, eval_label_esperada: string }}
 */
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
    };
  }
  return { ok: true, eval_key: resolved };
}

function mismatchErrorMessage(v) {
  return (
    "Este código corresponde a la evaluación «" +
    v.eval_label_codigo +
    "», no a «" +
    v.eval_label_esperada +
    "». Abra la evaluación correcta desde el portal."
  );
}

module.exports = {
  EVAL_KEYS,
  parseEvalKeyFromCodigo,
  resolveEvalKey,
  validateCodigoEval,
  evalLabelEs,
  mismatchErrorMessage,
};
