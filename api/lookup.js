const { sql } = require("@vercel/postgres");

module.exports = async function handler(req, res) {
  try {
    const codigo = req.method === "GET" ? req.query.codigo : req.body.codigo;

    if (!codigo) {
      return res.status(400).json({ error: "Falta codigo" });
    }

    const { rows } = await sql`
      SELECT codigo, institucion, grupo, curso, nombre, edad_anios, puede_ver_resultado
      FROM participants
      WHERE codigo = ${codigo}
      LIMIT 1;
    `;

    if (!rows.length) {
      return res.status(404).json({ error: "Código no encontrado" });
    }

    return res.status(200).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error interno" });
  }
};
