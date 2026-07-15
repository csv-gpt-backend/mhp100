const { sql } = require("@vercel/postgres");

function norm(v) {
  return String(v ?? "").trim();
}

function readBody(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === "string") {
    try {
      return JSON.parse(b);
    } catch {
      return {};
    }
  }
  return b;
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
      codigo_db: row.codigo,
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

async function buscarParticipante(codigoBuscado) {
  const codigo = norm(codigoBuscado);
  if (!codigo) return null;

  // Mismo patrón que lookup.js (probado en producción)
  let pRes = await sql`
    SELECT codigo
    FROM participants
    WHERE UPPER(codigo) = UPPER(${codigo})
    LIMIT 1
  `;
  if (pRes.rows.length) return pRes.rows[0];

  pRes = await sql`
    SELECT codigo
    FROM participants
    WHERE TRIM(codigo) ILIKE ${codigo}
    LIMIT 1
  `;
  if (pRes.rows.length) return pRes.rows[0];

  pRes = await sql`
    SELECT codigo
    FROM participants
    WHERE UPPER(TRIM(codigo)) = UPPER(TRIM(${codigo}))
    LIMIT 1
  `;
  if (pRes.rows.length) return pRes.rows[0];

  return null;
}

async function eliminarCodigo(req, res) {
  const body = readBody(req);
  const codigoRaw = norm(req.query.codigo || body.codigo || body.codigo_db || "");
  if (!codigoRaw) {
    return res.status(400).json({ ok: false, error: "Falta código" });
  }

  const participante = await buscarParticipante(codigoRaw);
  if (!participante) {
    return res.status(404).json({
      ok: false,
      error: "Código no encontrado en participants",
      buscado: codigoRaw
    });
  }

  const codigoDb = participante.codigo;

  const aRes = await sql`
    SELECT COUNT(*)::int AS n
    FROM attempts
    WHERE UPPER(codigo) = UPPER(${codigoDb})
  `;
  const intentos = Number(aRes.rows[0]?.n) || 0;
  if (intentos > 0) {
    return res.status(409).json({
      ok: false,
      error: "No se puede eliminar: ya tiene evaluación registrada"
    });
  }

  // Borrar por el valor exacto que está en la tabla
  await sql`
    DELETE FROM participants
    WHERE codigo = ${codigoDb}
  `;

  try {
    await sql`
      DELETE FROM autosave_eval
      WHERE UPPER(codigo) = UPPER(${codigoDb})
    `;
  } catch (_) {
    // autosave opcional
  }

  return res.status(200).json({
    ok: true,
    codigo: norm(codigoDb).toUpperCase(),
    codigo_db: codigoDb
  });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return await listarCodigos(res);
    }

    if (req.method === "POST") {
      const body = readBody(req);
      const action = norm(body.action || req.query.action).toLowerCase();
      if (action === "eliminar" || action === "delete") {
        return await eliminarCodigo(req, res);
      }
      return res.status(400).json({ ok: false, error: "Acción no válida" });
    }

    if (req.method === "DELETE") {
      return await eliminarCodigo(req, res);
    }

    return res.status(405).json({ error: "Solo GET, POST o DELETE" });
  } catch (e) {
    console.error("codigos error", e);
    return res.status(500).json({
      valid: false,
      ok: false,
      error: "Error en códigos",
      detail: String(e && e.message ? e.message : e)
    });
  }
};
