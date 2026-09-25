const { sql } = require("@vercel/postgres");
const {
  validateCodigoEval,
  mismatchErrorMessage,
  resolveIdioma,
  parseIdiomaFromCodigo,
} = require("./eval-codigo");
const bank = require("./data/sociv2-bank.json");
const bankEn = require("./data/sociv2-en-text.json");

module.exports = async function handler(req, res) {
  const codigoEarly = String((req.query && req.query.codigo) || "").trim().toUpperCase();
  const en = parseIdiomaFromCodigo(codigoEarly) === "EN";

  if (req.method !== "GET") {
    return res.status(405).json({ error: en ? "GET only" : "Solo se permite GET" });
  }

  const codigo = codigoEarly;
  if (!codigo) {
    return res.status(400).json({ error: en ? "Missing code" : "Falta el código" });
  }

  try {
    const pRes = await sql`
      SELECT *
      FROM participants
      WHERE UPPER(codigo) = UPPER(${codigo})
      LIMIT 1
    `;
    if (!pRes.rows.length) {
      return res.status(404).json({ error: en ? "Code not found" : "Código no encontrado" });
    }

    const participante = pRes.rows[0];
    const idioma = resolveIdioma(codigo, participante);
    const check = validateCodigoEval(codigo, "SOCIV2", participante);
    if (!check.ok) {
      return res.status(403).json({
        error: mismatchErrorMessage(check, idioma === "EN" ? "EN" : "ES"),
        eval_mismatch: true,
      });
    }

    const enById = new Map(
      (bankEn.items || []).map((it) => [Number(it.id), String(it.preg || "")])
    );
    if (idioma === "EN") {
      const missing = (bank.items || []).filter((it) => !enById.get(Number(it.id)));
      if (missing.length) {
        return res.status(500).json({ error: "English items are incomplete." });
      }
    }

    const bloques = new Set();
    const subs = new Set();
    const items = (bank.items || []).map((it) => {
      if (it.bloq) bloques.add(it.bloq);
      if (it.sub) subs.add(it.sub);
      const pregunta = idioma === "EN" ? enById.get(Number(it.id)) : it.preg;
      return { id: it.id, pregunta };
    });

    return res.status(200).json({
      ok: true,
      version: idioma === "EN" ? (bankEn.version || "SOCIV2-EN-v1") : (bank.version || "SOCIV2-v3-banco-244"),
      n: items.length,
      n_bloques: bloques.size,
      n_subs: subs.size,
      items,
    });
  } catch (err) {
    console.error("banco-socioemocional", err);
    return res.status(500).json({ error: en ? "The assessment could not be loaded." : "No se pudo cargar la evaluación." });
  }
};
