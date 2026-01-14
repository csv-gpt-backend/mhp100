const { sql } = require("@vercel/postgres");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Solo GET" });
    }

    const codigoRaw = (req.query.codigo || "").trim();
    const codigo = codigoRaw.toUpperCase();

    if (!codigo) {
      return res.status(400).json({ valid: false, error: "Falta codigo" });
    }

    // 1) Buscar participante por código (misma tabla que ya usabas)
    const pRes = await sql`
      SELECT *
      FROM participants
      WHERE UPPER(codigo) = UPPER(${codigo})
      LIMIT 1
    `;

    if (!pRes.rows.length) {
      // Código no existe
      return res.status(404).json({ valid: false, error: "Código no encontrado" });
    }

    const participant = pRes.rows[0];

    // 2) Último intento de evaluación para ese código
    const aRes = await sql`
      SELECT *
      FROM attempts
      WHERE UPPER(codigo) = UPPER(${codigo})
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const attempt = aRes.rows[0] || null;

    if (!attempt) {
      // Existe participante, pero nunca ha hecho evaluación
      return res.status(404).json({
        valid: true,
        error: "No se encontró un intento de evaluación para este código",
        participant,
        attempt: null
      });
    }

    // 3) Bandera puede_ver_resultado, sacada de la columna de la tabla
    // (si tu columna se llama diferente, cámbialo aquí)
    const rawFlag = participant.puede_ver_resultado;

    const puedeVer =
      rawFlag === true ||
      rawFlag === "true" ||
      rawFlag === "t" ||
      rawFlag === 1;

    console.log("API /report -> puede_ver_resultado:", puedeVer);

    // 4) Respuesta final que consume reporte10.html
    return res.status(200).json({
      valid: true,
      puede_ver_resultado: puedeVer,
      participant,
      attempt
    });
  } catch (e) {
    console.error("report error", e);
    return res.status(500).json({ valid: false, error: "Error interno" });
  }
};
