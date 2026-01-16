// api/autosave.js
const { sql } = require("@vercel/postgres");

module.exports = async function handler(req, res) {
  try {
    // Normalizamos método
    const method = (req.method || "GET").toUpperCase();

    if (method === "POST") {
      // =========================
      // GUARDAR / ACTUALIZAR
      // =========================
      const body = req.body || {};
      const rawCodigo = (body.codigo || "").trim();

      if (!rawCodigo) {
        return res.status(400).json({ ok: false, error: "Falta 'codigo'" });
      }

      const codigo = rawCodigo.toUpperCase();

      // Estructura mínima
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

      // Estrategia simple:
      // 1) Borramos cualquier registro previo de ese código
      // 2) Insertamos el estado nuevo
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
      // =========================
      // LEER ESTADO GUARDADO
      // =========================
      const rawCodigo = (req.query.codigo || "").trim();

      if (!rawCodigo) {
        return res.status(400).json({ ok: false, error: "Falta 'codigo'" });
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

    // Si llega otro método (PUT, DELETE, etc.)
    return res.status(405).json({ ok: false, error: "Método no permitido" });
  } catch (err) {
    console.error("autosave error", err);
    return res.status(500).json({ ok: false, error: "Error interno de servidor" });
  }
};
