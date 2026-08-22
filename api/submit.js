const { sql } = require("@vercel/postgres");
const {
  validateCodigoEval,
  validateCodigoIdioma,
  mismatchErrorMessage,
  idiomaMismatchMessage,
  normalizeIdioma,
} = require("./eval-codigo");

function msg(key, lang) {
  const en = normalizeIdioma(lang) === "EN";
  const map = {
    method: en ? "POST only" : "Solo POST",
    missing_code: en ? "Missing code" : "Falta codigo",
    code_not_found: en ? "Code not found" : "Código no encontrado",
    save_error: en ? "Error saving" : "Error al guardar",
  };
  return map[key] || (en ? "Error" : "Error");
}

module.exports = async function handler(req, res) {
  const bodyEarly = req.body || {};
  const snapEarly = bodyEarly.snapshot || {};
  const uiLangEarly =
    normalizeIdioma(
      bodyEarly.idioma || bodyEarly.lang || snapEarly.idioma || snapEarly.lang || ""
    ) || "ES";

  if (req.method !== "POST") {
    return res.status(405).json({ error: msg("method", uiLangEarly) });
  }

  try {
    const body = req.body || {};
    const codigoRaw = body.codigo;

    if (!codigoRaw) {
      return res.status(400).json({ error: msg("missing_code", uiLangEarly) });
    }

    const codigo = String(codigoRaw).trim().toUpperCase();
    const snapshot = body.snapshot || {};
    const evalEsperada =
      body.evaluacion || body.eval || snapshot.evaluacion || snapshot.eval || "";
    const idiomaEsperado =
      body.idioma || body.lang || snapshot.idioma || snapshot.lang || "";
    const uiLang = normalizeIdioma(idiomaEsperado) || "ES";

    const pRes = await sql`
      SELECT *
      FROM participants
      WHERE UPPER(codigo) = UPPER(${codigo})
      LIMIT 1
    `;

    if (!pRes.rows.length) {
      return res.status(404).json({
        error: msg("code_not_found", uiLang),
      });
    }

    if (evalEsperada) {
      const check = validateCodigoEval(codigo, evalEsperada, pRes.rows[0]);
      if (!check.ok) {
        return res.status(403).json({
          error: mismatchErrorMessage(check, uiLang),
          eval_mismatch: true,
          eval_codigo: check.eval_codigo,
          eval_esperada: check.eval_esperada,
        });
      }
    }

    if (idiomaEsperado) {
      const checkI = validateCodigoIdioma(codigo, idiomaEsperado, pRes.rows[0]);
      if (!checkI.ok) {
        return res.status(403).json({
          error: idiomaMismatchMessage(checkI, uiLang),
          idioma_mismatch: true,
          idioma_codigo: checkI.idioma_codigo,
          idioma_esperada: checkI.idioma_esperada,
        });
      }
    }

    const resultados = body.resultados || {};
    const responses = body.responses || null;

    const nombre = snapshot.nombre || null;
    const edad = snapshot.edad_anios ?? null;
    const institucion = snapshot.institucion || null;
    const grupo = snapshot.grupo || null;
    const curso = snapshot.curso || null;

    const g = resultados.globales || {};
    const b = resultados.bloques || {};

    const iie = g.IIE ?? null;
    const iv1 = g.IV1 ?? null;
    const iv2 = g.IV2 ?? null;
    const iv3 = g.IV3 ?? null;

    const b_intra = b.intrapersonales ?? null;
    const b_inter = b.interpersonales ?? null;
    const b_pv = b.para_la_vida ?? null;
    const b_estilos = b.estilos_comunicacion ?? null;
    const b_cambio = b.propension_cambio ?? null;

    await sql`
      INSERT INTO attempts (
        codigo, nombre, edad_anios, institucion, grupo, curso,
        iie, iv1, iv2, iv3,
        b_intra, b_inter, b_pv, b_estilos, b_cambio,
        resultados, responses
      )
      VALUES (
        ${codigo}, ${nombre}, ${edad}, ${institucion}, ${grupo}, ${curso},
        ${iie}, ${iv1}, ${iv2}, ${iv3},
        ${b_intra}, ${b_inter}, ${b_pv}, ${b_estilos}, ${b_cambio},
        ${JSON.stringify(resultados)},
        ${responses ? JSON.stringify(responses) : null}
      );
    `;

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("SUBMIT ERROR:", err);
    return res.status(500).json({ error: msg("save_error", uiLangEarly), detail: err.message });
  }
};
