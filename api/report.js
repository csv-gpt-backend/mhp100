const { sql } = require("@vercel/postgres");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Solo GET" });
    }

    const codigoRaw = (req.query.codigo || "").trim();
    const codigo = codigoRaw.toUpperCase();
    if (!codigo) return res.status(400).json({ valid: false, error: "Falta codigo" });

    // participant lookup (case-insensitive)
    const pRes = await sql`
      SELECT *
      FROM participants
      WHERE UPPER(codigo)=UPPER(${codigo})
      LIMIT 1
    `;
    if (!pRes.rows.length) {
      return res.status(200).json({ valid: false });
    }
    const participant = pRes.rows[0];

    const aRes = await sql`
      SELECT *
      FROM attempts
      WHERE UPPER(codigo)=UPPER(${codigo})
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const attempt = aRes.rows[0] || null;

    return res.status(200).json({
      valid: true,
      participant,
      attempt
    });

  } catch (e) {
    console.error("report error", e);
    return res.status(500).json({ valid: false, error: "Error interno" });
  }
};
