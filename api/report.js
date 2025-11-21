const { sql } = require("@vercel/postgres");

module.exports = async function handler(req, res) {
  try {
    let codigo = req.query.codigo;
    if (!codigo) return res.status(400).json({ error: "Falta codigo" });

    codigo = String(codigo).trim().toUpperCase();

    const p = await sql`
      SELECT codigo, institucion, grupo, curso, puede_ver_resultado
      FROM participants
      WHERE codigo = ${codigo}
      LIMIT 1;
    `;
    if (!p.rows.length) {
      return res.status(404).json({ error: "Código no encontrado" });
    }

    const a = await sql`
      SELECT *
      FROM attempts
      WHERE codigo = ${codigo}
      ORDER BY created_at DESC
      LIMIT 1;
    `;

    return res.status(200).json({
      participant: p.rows[0],
      attempt: a.rows[0] || null
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error interno" });
  }
};
