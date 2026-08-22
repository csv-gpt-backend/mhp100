const { sql } = require("@vercel/postgres");
const {
  resolveEvalKey,
  resolveIdioma,
  validateCodigoEval,
  validateCodigoIdioma,
  mismatchErrorMessage,
  idiomaMismatchMessage,
  normalizeIdioma,
} = require("./eval-codigo");

function msg(key, lang) {
  const en = normalizeIdioma(lang) === "EN";
  const map = {
    method: en ? "GET only" : "Solo se permite GET",
    missing_code: en ? "Missing code" : "Falta el código",
    code_not_found: en ? "Code not found" : "Código no encontrado",
    internal: en ? "Internal error" : "Error interno",
  };
  return map[key] || (en ? "Error" : "Error");
}

module.exports = async function handler(req, res) {
  const uiLangEarly =
    normalizeIdioma((req.query && (req.query.idioma || req.query.lang)) || "") || "ES";

  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: msg("method", uiLangEarly) });
    }

    const codigoRaw = (req.query.codigo || "").trim();
    const codigo = codigoRaw.toUpperCase();
    const evalEsperada = req.query.eval || req.query.evaluacion || "";
    const idiomaEsperado = req.query.idioma || req.query.lang || "";
    const uiLang = normalizeIdioma(idiomaEsperado) || "ES";

    if (!codigo) {
      return res.status(400).json({ error: msg("missing_code", uiLang) });
    }

    const pRes = await sql`
      SELECT *
      FROM participants
      WHERE UPPER(codigo) = UPPER(${codigo})
      LIMIT 1
    `;

    if (!pRes.rows.length) {
      return res.status(404).json({ error: msg("code_not_found", uiLang) });
    }

    const participante = pRes.rows[0];
    const evalKey = resolveEvalKey(codigo, participante);
    const idioma = resolveIdioma(codigo, participante);

    // Idioma primero: si el código es EN en portal ES (o viceversa), orientar al portal correcto
    if (idiomaEsperado) {
      const checkI = validateCodigoIdioma(codigo, idiomaEsperado, participante);
      if (!checkI.ok) {
        return res.status(403).json({
          error: idiomaMismatchMessage(checkI, uiLang),
          idioma_mismatch: true,
          idioma_codigo: checkI.idioma_codigo,
          idioma_esperada: checkI.idioma_esperada,
        });
      }
    }

    if (evalEsperada) {
      const check = validateCodigoEval(codigo, evalEsperada, participante);
      if (!check.ok) {
        return res.status(403).json({
          error: mismatchErrorMessage(check, uiLang),
          eval_mismatch: true,
          eval_codigo: check.eval_codigo,
          eval_esperada: check.eval_esperada,
          eval_label_codigo: check.eval_label_codigo,
          eval_label_esperada: check.eval_label_esperada,
        });
      }
    }

    const aRes = await sql`
      SELECT COUNT(*)::int AS n
      FROM attempts
      WHERE UPPER(codigo) = UPPER(${codigo})
    `;
    const intentosUsados = aRes.rows[0]?.n || 0;
    const intentosMax = 1;

    const usado = intentosUsados >= intentosMax;
    const disponible = !usado;
    const estado = usado ? "completado" : "activo";

    return res.status(200).json({
      codigo: participante.codigo,
      nombre: participante.nombre,
      institucion: participante.institucion,
      grupo: participante.grupo,
      curso: participante.curso,
      puede_ver_resultado: participante.puede_ver_resultado,
      eval_key: evalKey || null,
      evaluacion: evalKey || null,
      idioma: idioma || "ES",

      intentos_max: intentosMax,
      intentos_usados: intentosUsados,
      usado,
      disponible,
      estado,
    });
  } catch (e) {
    console.error("lookup error", e);
    return res.status(500).json({ error: msg("internal", uiLangEarly) });
  }
};
