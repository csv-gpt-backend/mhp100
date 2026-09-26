const { sql } = require("@vercel/postgres");
const {
  validateCodigoEval,
  validateCodigoIdioma,
  mismatchErrorMessage,
  idiomaMismatchMessage,
  normalizeIdioma,
} = require("./eval-codigo");
const { scoreSocies } = require("./score-socies");
const { scoreSociv2 } = require("./score-sociv2");
const { scoreSocpeq } = require("./score-socpeq");
const { scoreAprend } = require("./score-aprend");
const { scoreIntegr } = require("./score-integr");
const { scoreLider } = require("./score-lider");

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

    const responses = body.responses || null;
    const evalKey = String(
      body.evaluacion || body.eval || snapshot.evaluacion || snapshot.eval || ""
    ).toUpperCase();

    let resultados = body.resultados || {};
    if (evalKey === "SOCIES") {
      const scored = scoreSocies(responses, snapshot.startTime);
      if (!scored.ok) {
        return res.status(400).json({ error: scored.error || "No se pudo calcular el resultado." });
      }
      resultados = scored.resultados;
    } else if (evalKey === "SOCIV2") {
      const scored = scoreSociv2(responses, snapshot.startTime);
      if (!scored.ok) {
        const fallback = uiLang === "EN" ? "The result could not be calculated." : "No se pudo calcular el resultado.";
        let error = scored.error || fallback;
        if (uiLang === "EN" && error === "Faltan respuestas.") error = "Some answers are missing.";
        return res.status(400).json({ error });
      }
      resultados = scored.resultados;
    } else if (evalKey === "SOCPEQ") {
      const scored = scoreSocpeq(responses, snapshot.startTime);
      if (!scored.ok) {
        return res.status(400).json({ error: scored.error || "No se pudo calcular el resultado." });
      }
      resultados = scored.resultados;
    } else if (evalKey === "APREND") {
      const vals = responses && typeof responses === "object" ? Object.values(responses) : [];
      const letras = vals.length > 0 && vals.every((v) => {
        const c = String(v || "").trim().toUpperCase();
        return c === "MO" || c === "AO" || c === "NM";
      });
      if (letras) {
        const scored = scoreAprend(responses, snapshot.startTime, codigo);
        if (!scored.ok) {
          return res.status(400).json({ error: scored.error || "No se pudo calcular el resultado." });
        }
        resultados = scored.resultados;
      }
    } else if (evalKey === "INTEGR") {
      const vals = responses && typeof responses === "object" ? Object.values(responses) : [];
      const letras = vals.length > 0 && vals.every((v) => {
        const c = String(v || "").trim().toUpperCase();
        return c === "CS" || c === "AV" || c === "RV";
      });
      if (letras) {
        const scored = scoreIntegr(responses, snapshot.startTime);
        if (!scored.ok) {
          return res.status(400).json({ error: scored.error || "No se pudo calcular el resultado." });
        }
        resultados = scored.resultados;
      }
    } else if (evalKey === "LIDERA") {
      const vals = responses && typeof responses === "object" ? Object.values(responses) : [];
      const letras = vals.length > 0 && vals.every((v) => {
        const c = String(v || "").trim().toUpperCase();
        return c === "CS" || c === "AV" || c === "RV";
      });
      if (letras) {
        const scored = scoreLider(responses, snapshot.startTime);
        if (!scored.ok) {
          return res.status(400).json({ error: scored.error || "No se pudo calcular el resultado." });
        }
        resultados = scored.resultados;
      }
    }

    const nombrePila = snapshot.nombre ? String(snapshot.nombre).trim() : null;
    const apellido = snapshot.apellido ? String(snapshot.apellido).trim() : null;
    // Columna nombre: display completo (compat). apellido también en resultados para ordenar grupal.
    const nombre = [nombrePila, apellido].filter(Boolean).join(" ") || null;
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

    const resultadosOut = {
      ...resultados,
      nombre_pila: nombrePila || resultados.nombre_pila || null,
      apellido: apellido || resultados.apellido || null,
    };

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
        ${JSON.stringify(resultadosOut)},
        ${responses ? JSON.stringify(responses) : null}
      );
    `;

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("SUBMIT ERROR:", err);
    return res.status(500).json({ error: msg("save_error", uiLangEarly), detail: err.message });
  }
};
