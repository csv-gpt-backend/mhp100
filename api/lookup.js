const { sql } = require("@vercel/postgres");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Solo se permite GET" });
    }

    const codigoRaw = (req.query.codigo || "").trim();
    const codigo = codigoRaw.toUpperCase();

    if (!codigo) {
      return res.status(400).json({ error: "Falta el código" });
    }

    // 1) Buscar participante por código (case-insensitive)
    const pRes = await sql`
      SELECT *
      FROM participants
      WHERE UPPER(codigo) = UPPER(${codigo})
      LIMIT 1
    `;

    if (!pRes.rows.length) {
      // No existe el código en la tabla de participantes
      return res.status(404).json({ error: "Código no encontrado" });
    }

    const participante = pRes.rows[0];

    // 2) Contar intentos registrados para este código
    const aRes = await sql`
      SELECT COUNT(*)::int AS n
      FROM attempts
      WHERE UPPER(codigo) = UPPER(${codigo})
    `;
    const intentosUsados = aRes.rows[0]?.n || 0;
    const intentosMax = 1; // un intento por código

    const usado = intentosUsados >= intentosMax;
    const disponible = !usado;
    const estado = usado ? "completado" : "activo";

    // 3) Respuesta en formato plano para el frontend de evaluacion.html
    return res.status(200).json({
      // datos básicos que ya usas
      codigo: participante.codigo,
      nombre: participante.nombre,
      institucion: participante.institucion,
      grupo: participante.grupo,
      curso: participante.curso,

      // este campo ya lo usas en el reporte
      puede_ver_resultado: participante.puede_ver_resultado,

      // campos para la lógica de "código usado" en el frontend
      intentos_max: intentosMax,
      intentos_usados: intentosUsados,
      usado,          // true / false
      disponible,     // true / false
      estado          // "activo" o "completado"
    });

  } catch (e) {
    console.error("lookup error", e);
    return res.status(500).json({ error: "Error interno" });
  }
};
