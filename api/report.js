const { sql } = require("@vercel/postgres");
const {
  validateCodigoEval,
  validateCodigoIdioma,
  mismatchErrorMessage,
  idiomaMismatchMessage,
  normalizeIdioma,
} = require("./eval-codigo");

function isIdiomaLockedReportEval(raw) {
  const t = String(raw || "").trim().toUpperCase();
  if (t === "APREND" || t === "APRENDIZAJE" || t === "APREN" || t === "APR") return true;
  if (t === "HABITO" || t === "HABITOS" || t === "HABIT" || t === "HAB") return true;
  if (t === "SOCIOE" || t === "SOCIOEMOCIONAL" || t === "SOCIO" || t === "SOC") return true;
  if (t === "INTEGR" || t === "INTEGRIDAD" || t === "VALORES" || t === "INTG") return true;
  return false;
}

function isEn(lang) {
  return normalizeIdioma(lang) === "EN";
}

function reportMsg(key, lang, extra) {
  const en = isEn(lang);
  const map = {
    method: en ? "GET only" : "Solo GET",
    missing_code: en ? "Missing code" : "Falta codigo",
    code_not_found: en ? "Code not found" : "Código no encontrado",
    no_attempt: en
      ? "No assessment attempt was found for this code"
      : "No se encontró un intento de evaluación para este código",
    no_attempt_bank: en
      ? `No attempt was found for this code with bank=${extra || ""}`
      : `No se encontró un intento para este código con bank=${extra || ""}`,
    internal: en ? "Internal error" : "Error interno",
  };
  return map[key] || (en ? "Error" : "Error");
}

module.exports = async function handler(req, res) {
  try {
    const uiLang =
      normalizeIdioma(req.query.idioma || req.query.lang || "") || "ES";

    if (req.method !== "GET") {
      return res.status(405).json({ error: reportMsg("method", uiLang) });
    }

    const codigoRaw = (req.query.codigo || "").trim();
    const codigo = codigoRaw.toUpperCase();

    if (!codigo) {
      return res.status(400).json({ valid: false, error: reportMsg("missing_code", uiLang) });
    }

    // NUEVO: parámetro opcional para filtrar banco
    // Ejemplos:
    //   /api/report?codigo=LIDE800&bank=LID-v1
    //   /api/report?codigo=ABCD123&bank=IE-v1
    const bankRaw = (req.query.bank || "").trim();
    const bankUpper = bankRaw.toUpperCase();
    const bankNorm =
      bankUpper === "LID-V1" ? "LID-v1" :
      bankUpper === "IE-V1"  ? "IE-v1"  :
      "";

    // 1) Buscar participante por código
    const pRes = await sql`
      SELECT *
      FROM participants
      WHERE UPPER(codigo) = UPPER(${codigo})
      LIMIT 1
    `;

    if (!pRes.rows.length) {
      return res.status(404).json({ valid: false, error: reportMsg("code_not_found", uiLang) });
    }

    const participant = pRes.rows[0];

    const evalEsperada = req.query.eval || req.query.evaluacion || "";

    if (evalEsperada) {
      const check = validateCodigoEval(codigo, evalEsperada, participant);
      if (!check.ok) {
        return res.status(403).json({
          valid: false,
          error: mismatchErrorMessage(check, uiLang),
          eval_mismatch: true,
          eval_codigo: check.eval_codigo,
          eval_esperada: check.eval_esperada,
        });
      }
      if (isIdiomaLockedReportEval(evalEsperada)) {
        const checkI = validateCodigoIdioma(codigo, uiLang, participant);
        if (!checkI.ok) {
          return res.status(403).json({
            valid: false,
            error: idiomaMismatchMessage(checkI, uiLang),
            idioma_mismatch: true,
            idioma_codigo: checkI.idioma_codigo,
            idioma_esperada: checkI.idioma_esperada,
          });
        }
      }
    }

    // 2) Último intento para ese código (con filtro opcional por bank)
    let aRes;

    if (bankNorm) {
      // Si tu columna snapshot es JSON/JSONB (lo normal), esto funciona:
      aRes = await sql`
        SELECT *
        FROM attempts
        WHERE UPPER(codigo) = UPPER(${codigo})
          AND COALESCE(snapshot->>'version_banco','') = ${bankNorm}
        ORDER BY created_at DESC
        LIMIT 1
      `;
    } else {
      // fallback: comportamiento original (no rompe reportes viejos)
      aRes = await sql`
        SELECT *
        FROM attempts
        WHERE UPPER(codigo) = UPPER(${codigo})
        ORDER BY created_at DESC
        LIMIT 1
      `;
    }

    const attempt = aRes.rows[0] || null;

    if (!attempt) {
      return res.status(404).json({
        valid: true,
        error: bankNorm
          ? reportMsg("no_attempt_bank", uiLang, bankNorm)
          : reportMsg("no_attempt", uiLang),
        participant,
        attempt: null
      });
    }

    // 3) Bandera puede_ver_resultado
    const rawFlag = participant.puede_ver_resultado;
    const puedeVer =
      rawFlag === true ||
      rawFlag === "true" ||
      rawFlag === "t" ||
      rawFlag === 1;

    console.log("API /report -> puede_ver_resultado:", puedeVer, "bank:", bankNorm || "(sin filtro)");

    // 4) Respuesta final
    return res.status(200).json({
      valid: true,
      puede_ver_resultado: puedeVer,
      participant,
      attempt
    });
  } catch (e) {
    console.error("report error", e);
    const uiLang =
      normalizeIdioma((req.query && (req.query.idioma || req.query.lang)) || "") || "ES";
    return res.status(500).json({ valid: false, error: reportMsg("internal", uiLang) });
  }
};
