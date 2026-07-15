const { sql } = require("@vercel/postgres");

function norm(v) {
  return String(v ?? "").trim();
}

async function listarCodigos(res) {
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
}

async function eliminarCodigo(req, res) {
  const codigo = norm(req.query.codigo || (req.body && req.body.codigo) || "").toUpperCase();
  if (!codigo) {
    return res.status(400).json({ ok: false, error: "Falta código" });
  }

  const aRes = await sql`
    SELECT COUNT(*)::int AS n
    FROM attempts
    WHERE UPPER(TRIM(codigo)) = UPPER(${codigo})
  `;
  const intentos = Number(aRes.rows[0]?.n) || 0;
  if (intentos > 0) {
    return res.status(409).json({
      ok: false,
      error: "No se puede eliminar: ya tiene evaluación registrada"
    });
  }

  const pRes = await sql`
    SELECT codigo
    FROM participants
    WHERE UPPER(TRIM(codigo)) = UPPER(${codigo})
    LIMIT 1
  `;
  if (!pRes.rows.length) {
    return res.status(404).json({ ok: false, error: "Código no encontrado" });
  }

  await sql`
    DELETE FROM participants
    WHERE UPPER(TRIM(codigo)) = UPPER(${codigo})
  `;

  try {
    await sql`
      DELETE FROM autosave_eval
      WHERE UPPER(TRIM(codigo)) = UPPER(${codigo})
    `;
  } catch (_) {
    // la tabla de autosave puede no existir en todos los entornos
  }

  return res.status(200).json({ ok: true, codigo });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return await listarCodigos(res);
    }
    if (req.method === "DELETE") {
      return await eliminarCodigo(req, res);
    }
    return res.status(405).json({ error: "Solo GET o DELETE" });
  } catch (e) {
    console.error("codigos error", e);
    return res.status(500).json({
      valid: false,
      ok: false,
      error: "Error en códigos"
    });
  }
};
