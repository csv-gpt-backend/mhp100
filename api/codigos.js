const { sql } = require("@vercel/postgres");

function norm(v) {
  return String(v ?? "").trim();
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Solo GET" });
    }

    const pRes = await sql`
      SELECT
        p.codigo,
        p.nombre,
        p.institucion,
        p.grupo,
        p.curso,
        p.puede_ver_resultado,
        (
          SELECT a.created_at
          FROM attempts a
          WHERE UPPER(TRIM(a.codigo)) = UPPER(TRIM(p.codigo))
          ORDER BY a.created_at DESC
          LIMIT 1
        ) AS fecha_intento,
        (
          SELECT COUNT(*)::int
          FROM attempts a
          WHERE UPPER(TRIM(a.codigo)) = UPPER(TRIM(p.codigo))
        ) AS intentos
      FROM participants p
      WHERE p.codigo IS NOT NULL AND TRIM(p.codigo) <> ''
      ORDER BY UPPER(TRIM(p.codigo))
    `;

    const filas = (pRes.rows || []).map((row) => {
      const codigo = norm(row.codigo).toUpperCase();
      const intentos = Number(row.intentos) || 0;
      return {
        codigo,
        nombre: norm(row.nombre) || null,
        institucion: norm(row.institucion) || "",
        pais: norm(row.grupo) || "",
        curso: norm(row.curso) || "",
        puede_ver_resultado: !!row.puede_ver_resultado,
        fecha_intento: row.fecha_intento || null,
        intentos,
        estado: intentos > 0 ? "completado" : "activo"
      };
    });

    return res.status(200).json({
      valid: true,
      total: filas.length,
      filas
    });
  } catch (e) {
    console.error("codigos error", e);
    return res.status(500).json({ valid: false, error: "Error al listar códigos" });
  }
};
