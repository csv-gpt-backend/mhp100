const { sql } = require("@vercel/postgres");
const {
  validateCodigoEval,
  validateCodigoIdioma,
  mismatchErrorMessage,
  idiomaMismatchMessage,
  parseIdiomaFromCodigo,
  resolveIdioma,
} = require("./eval-codigo");
const { publicBank } = require("./score-intel");

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
    const checkI = validateCodigoIdioma(codigo, lang, participante);
    if (!checkI.ok) {
      return res.status(403).json({
        error: idiomaMismatchMessage(checkI, lang),
        idioma_mismatch: true,
      });
    }
    const check = validateCodigoEval(codigo, "INTELC", participante);
    if (!check.ok) {
      return res.status(403).json({
        error: mismatchErrorMessage(check, lang),
        eval_mismatch: true,
      });
    }

    const body = publicBank(lang);
    const flat = JSON.stringify(body);
    if (flat.indexOf('"correct"') !== -1) {
      return res.status(500).json({
        error: say(lang, "No se pudo cargar la evaluación.", "The assessment could not be loaded."),
      });
    }
    return res.status(200).json(body);
  } catch (err) {
    console.error("banco-intelectual", err);
    const lang = uiFrom(codigo, null);
    return res.status(500).json({
      error: say(lang, "No se pudo cargar la evaluación.", "The assessment could not be loaded."),
    });
  }
};
