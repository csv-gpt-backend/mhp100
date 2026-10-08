const { sql } = require("@vercel/postgres");
const {
  validateCodigoEval,
  validateCodigoIdioma,
  mismatchErrorMessage,
  idiomaMismatchMessage,
  normalizeIdioma,
} = require("./eval-codigo");
const { validacionDesdeRespuestas } = require("./score-integr");

function isIdiomaLockedReportEval(raw) {
  const t = String(raw || "").trim().toUpperCase();
  if (t === "APREND" || t === "APRENDIZAJE" || t === "APREN" || t === "APR") return true;
  if (t === "HABITO" || t === "HABITOS" || t === "HABIT" || t === "HAB") return true;
  if (t === "SOCIOE" || t === "SOCIOEMOCIONAL" || t === "SOCIO" || t === "SOC") return true;
  if (t === "SOCIV2" || t === "SOCIOEMOCIONALV2" || t === "EMOV2" || t === "SOC2") return true;
  if (t === "SOCPEQ" || t === "SOCPEQUES" || t === "SOCINF") return true;
  if (t === "SOCIES" || t === "SOCIESC" || t === "SOCIOEMOCIONALESCOLAR" || t === "SOCESC") return true;
  if (t === "INTEGR" || t === "INTEGRIDAD" || t === "VALORES" || t === "INTG") return true;
  if (t === "INTELC" || t === "INTELECTUAL" || t === "INTEL" || t === "INTE") return true;
  if (t === "LIDERA" || t === "LIDERAZGO" || t === "LIDER" || t === "LIDE" || t === "LID") return true;
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

function asObject(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (e) {
      return null;
    }
  }
  return null;
}

function esIntentoIntegridad(attempt, resultados) {
  const codigo = String((attempt && attempt.codigo) || "").toUpperCase();
  if (codigo.includes("INTEGR")) return true;
  const subs = resultados && resultados.subhabilidades;
  return Array.isArray(subs) && subs.some((row) => {
    const sub = String((row && (row.sub || row.subhabilidad)) || "");
    return sub === "Rectitud" || sub === "Veracidad" || sub === "Honestidad" || sub === "Justicia";
  });
}

function alinearValidacionIntegridad(attempt) {
  if (!attempt) return;
  const resultados = asObject(attempt.resultados);
  if (!resultados || !esIntentoIntegridad(attempt, resultados)) return;
  const responses = asObject(attempt.responses);
  const validacion = validacionDesdeRespuestas(responses);
  if (!validacion) return;
  if (!resultados.globales || typeof resultados.globales !== "object") {
    resultados.globales = {};
  }
  resultados.globales.IV1 = validacion.IV1;
  resultados.globales.IV2 = validacion.IV2;
  attempt.resultados = resultados;
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
      // Idioma primero cuando el reporte exige candado de idioma
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

    alinearValidacionIntegridad(attempt);

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
