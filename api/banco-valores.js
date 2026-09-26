const { sql } = require("@vercel/postgres");
const {
  validateCodigoEval,
  validateCodigoIdioma,
  mismatchErrorMessage,
  idiomaMismatchMessage,
  parseIdiomaFromCodigo,
  resolveIdioma,
} = require("./eval-codigo");
const bankEs = require("./data/integr-bank.json");
const bankEn = require("./data/integr-bank-en.json");

function uiFrom(codigo, row) {
  if (row) return resolveIdioma(codigo, row) === "EN" ? "EN" : "ES";
  return parseIdiomaFromCodigo(codigo) === "EN" ? "EN" : "ES";
}

function say(lang, es, en) {
  return lang === "EN" ? en : es;
}

module.exports = async function handler(req, res) {
  const codigo = String((req.query && req.query.codigo) || "").trim().toUpperCase();
  const hint = codigo ? uiFrom(codigo, null) : "ES";

  if (req.method !== "GET") {
    return res.status(405).json({ error: say(hint, "Solo se permite GET", "Only GET is allowed") });
  }
  if (!codigo) {
    return res.status(400).json({ error: say(hint, "Falta el código", "The code is missing") });
  }

  try {
    const pRes = await sql`
      SELECT *
      FROM participants
      WHERE UPPER(codigo) = UPPER(${codigo})
      LIMIT 1
    `;
    if (!pRes.rows.length) {
      return res.status(404).json({ error: say(hint, "Código no encontrado", "Code not found") });
    }

    const participante = pRes.rows[0];
    const lang = uiFrom(codigo, participante);
    const bank = lang === "EN" ? bankEn : bankEs;
    const checkI = validateCodigoIdioma(codigo, lang, participante);
    if (!checkI.ok) {
      return res.status(403).json({
        error: idiomaMismatchMessage(checkI, lang),
        idioma_mismatch: true,
      });
    }
    const check = validateCodigoEval(codigo, "INTEGR", participante);
    if (!check.ok) {
      return res.status(403).json({
        error: mismatchErrorMessage(check, lang),
        eval_mismatch: true,
      });
    }

    const bloques = new Set();
    const subs = new Set();
    const items = (bank.items || []).map((it) => {
      if (it.bloque) bloques.add(it.bloque);
      if (it.subhabilidad) subs.add(it.subhabilidad);
      return { id: it.id, pregunta: it.pregunta };
    });

    return res.status(200).json({
      ok: true,
      version: bank.version || (lang === "EN" ? "INTEG-EN-v1" : "INTEG-v1"),
      n: items.length,
      n_bloques: bloques.size,
      n_subs: subs.size,
      items,
    });
  } catch (err) {
    console.error("banco-valores", err);
    const lang = uiFrom(codigo, null);
    return res.status(500).json({
      error: say(lang, "No se pudo cargar la evaluación.", "The assessment could not be loaded."),
    });
  }
};
