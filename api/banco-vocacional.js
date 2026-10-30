const { sql } = require("@vercel/postgres");
const {
  validateCodigoEval,
  validateCodigoIdioma,
  mismatchErrorMessage,
  idiomaMismatchMessage,
  parseIdiomaFromCodigo,
  resolveIdioma,
} = require("./eval-codigo");
const bankEs = require("./data/vocac-bank.json");
const bankEn = require("./data/vocac-bank-en.json");

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
    const check = validateCodigoEval(codigo, "VOCACI", participante);
    if (!check.ok) {
      return res.status(403).json({
        error: mismatchErrorMessage(check, lang),
        eval_mismatch: true,
      });
    }

    const items = (bank.items || []).map((it) => {
      if (it.tipo === "riasec") {
        return {
          id: it.id,
          seccion: it.seccion,
          tipo: it.tipo,
          pregunta: it.pregunta,
        };
      }
      return {
        id: it.id,
        seccion: it.seccion,
        tipo: it.tipo || "visual",
        titulo: it.titulo || "",
        ayuda: it.ayuda || "",
        pregunta: it.pregunta || it.titulo || "",
        stimulus_html: it.stimulus_html || "",
        opciones: (it.opciones || []).map((op) => ({
          key: op.key,
          html: op.html,
        })),
      };
    });

    return res.status(200).json({
      ok: true,
      version: bank.version || (lang === "EN" ? "VOC-EN-v1-banco-servidor" : "VOC-v1-banco-servidor"),
      n: items.length,
      section_meta: bank.section_meta || {},
      items,
    });
  } catch (err) {
    console.error("banco-vocacional", err);
    const lang = uiFrom(codigo, null);
    return res.status(500).json({
      error: say(lang, "No se pudo cargar la evaluación.", "The assessment could not be loaded."),
    });
  }
};
