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

    // NUEVO: parámetro opcional para filtrar banco
    // Ejemplos:
    //   /api/report?codigo=LIDE800&bank=LID-v1
    //   /api/report?codigo=ABCD123&bank=IE-v1
    const bankRaw = (req.query.bank || "").trim();
    const bankUpper = bankRaw.toUpperCase();
    const bankNorm =
      bankUpper === "LID-V1" ? "LID-v1" :
      bankUpper === "IE-V1"  ? "IE-v1"  :
      "";

    // 1) Buscar participante por código
    const pRes = await sql`
      SELECT *
      FROM participants
      WHERE UPPER(codigo) = UPPER(${codigo})
      LIMIT 1
    `;

    if (!pRes.rows.length) {
      return res.status(404).json({ valid: false, error: "Código no encontrado" });
    }

    const participant = pRes.rows[0];

    // 2) Último intento para ese código (con filtro opcional por bank)
    let aRes;

    if (bankNorm) {
      // Si tu columna snapshot es JSON/JSONB (lo normal), esto funciona:
      aRes = await sql`
        SELECT *
        FROM attempts
        WHERE UPPER(codigo) = UPPER(${codigo})
          AND COALESCE(snapshot->>'version_banco','') = ${bankNorm}
        ORDER BY created_at DESC
        LIMIT 1
      `;
    } else {
      // fallback: comportamiento original (no rompe reportes viejos)
      aRes = await sql`
        SELECT *
        FROM attempts
        WHERE UPPER(codigo) = UPPER(${codigo})
        ORDER BY created_at DESC
        LIMIT 1
      `;
    }

    const attempt = aRes.rows[0] || null;

    if (!attempt) {
      return res.status(404).json({
        valid: true,
        error: bankNorm
          ? `No se encontró un intento para este código con bank=${bankNorm}`
          : "No se encontró un intento de evaluación para este código",
        participant,
        attempt: null
      });
    }

    // 3) Bandera puede_ver_resultado
    const rawFlag = participant.puede_ver_resultado;
    const puedeVer =
      rawFlag === true ||
      rawFlag === "true" ||
      rawFlag === "t" ||
      rawFlag === 1;

    console.log("API /report -> puede_ver_resultado:", puedeVer, "bank:", bankNorm || "(sin filtro)");

    // 4) Respuesta final
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
