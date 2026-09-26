const { sql } = require("@vercel/postgres");
const {
  validateCodigoEval,
  validateCodigoIdioma,
  mismatchErrorMessage,
  idiomaMismatchMessage,
  normalizeIdioma,
} = require("./eval-codigo");
const bank = require("./data/integr-bank.json");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Solo se permite GET" });
  }

  const codigo = String((req.query && req.query.codigo) || "").trim().toUpperCase();
  if (!codigo) {
    return res.status(400).json({ error: "Falta el código" });
  }

  try {
    const pRes = await sql`
      SELECT *
      FROM participants
      WHERE UPPER(codigo) = UPPER(${codigo})
      LIMIT 1
    `;
    if (!pRes.rows.length) {
      return res.status(404).json({ error: "Código no encontrado" });
    }

    const participante = pRes.rows[0];
    const checkI = validateCodigoIdioma(codigo, "ES", participante);
    if (!checkI.ok) {
      return res.status(403).json({
        error: idiomaMismatchMessage(checkI, normalizeIdioma("ES") || "ES"),
        idioma_mismatch: true,
      });
    }
    const check = validateCodigoEval(codigo, "INTEGR", participante);
    if (!check.ok) {
      return res.status(403).json({
        error: mismatchErrorMessage(check, "ES"),
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
      version: bank.version || "INTEG-v1",
      n: items.length,
      n_bloques: bloques.size,
      n_subs: subs.size,
      items,
    });
  } catch (err) {
    console.error("banco-valores", err);
    return res.status(500).json({ error: "No se pudo cargar la evaluación." });
  }
};
