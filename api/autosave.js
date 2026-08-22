// api/autosave.js
const { sql } = require("@vercel/postgres");

function normalizeIdioma(raw) {
  const t = String(raw || "").trim().toUpperCase();
  if (t === "EN" || t === "ENG" || t === "ENGLISH" || t === "US") return "EN";
  if (t === "ES" || t === "ESP" || t === "SPANISH") return "ES";
  return "";
}

function msg(key, lang) {
  const en = normalizeIdioma(lang) === "EN";
  const map = {
    missing_code: en ? "Missing code" : "Falta 'codigo'",
    method: en ? "Method not allowed" : "Método no permitido",
    internal: en ? "Internal server error" : "Error interno de servidor",
  };
  return map[key] || (en ? "Error" : "Error");
}

function langFrom(req) {
  const body = req.body || {};
  const snap = body.snapshot || {};
  return (
    normalizeIdioma(
      (req.query && (req.query.idioma || req.query.lang)) ||
        body.idioma ||
        body.lang ||
        snap.idioma ||
        snap.lang ||
        ""
    ) || "ES"
  );
}

module.exports = async function handler(req, res) {
  const uiLang = langFrom(req);
  try {
    const method = (req.method || "GET").toUpperCase();

    if (method === "POST") {
      const body = req.body || {};
      const rawCodigo = (body.codigo || "").trim();

      if (!rawCodigo) {
        return res.status(400).json({ ok: false, error: msg("missing_code", uiLang) });
      }

      const codigo = rawCodigo.toUpperCase();

      const currentPage =
        typeof body.currentPage === "number" && body.currentPage >= 0
          ? body.currentPage
          : 0;

      const responses =
        body.responses && typeof body.responses === "object"
          ? body.responses
          : {};

      const snapshot =
        body.snapshot && typeof body.snapshot === "object"
          ? body.snapshot
          : {};

      await sql`
        DELETE FROM autosave_eval
        WHERE UPPER(codigo) = UPPER(${codigo})
      `;

      const insertResult = await sql`
        INSERT INTO autosave_eval (codigo, snapshot, responses, current_page)
        VALUES (${codigo}, ${snapshot}::jsonb, ${responses}::jsonb, ${currentPage})
        RETURNING *
      `;

      const row = insertResult.rows[0];

      return res.status(200).json({
        ok: true,
        codigo,
        autosave: row,
      });
    }

    if (method === "GET") {
      const rawCodigo = (req.query.codigo || "").trim();

      if (!rawCodigo) {
        return res.status(400).json({ ok: false, error: msg("missing_code", uiLang) });
      }

      const codigo = rawCodigo.toUpperCase();

      const result = await sql`
        SELECT *
        FROM autosave_eval
        WHERE UPPER(codigo) = UPPER(${codigo})
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
      `;

      const row = result.rows[0] || null;

      return res.status(200).json({
        ok: true,
        codigo,
        autosave: row,
      });
    }

    return res.status(405).json({ ok: false, error: msg("method", uiLang) });
  } catch (err) {
    console.error("autosave error", err);
    return res.status(500).json({ ok: false, error: msg("internal", uiLang) });
  }
};
