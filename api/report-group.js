const { sql } = require("@vercel/postgres");

function parseResultados(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function igFromResultados(raw) {
  const r = parseResultados(raw);
  if (!r) return null;
  const pct = r.total && r.total.pct != null ? Number(r.total.pct) : null;
  if (pct == null || Number.isNaN(pct)) return null;
  return Math.round(Math.max(0, Math.min(100, pct)));
}

function norm(v) {
  return String(v ?? "").trim();
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Solo GET" });
    }

    // Listas para selectores (desde attempts)
    if (String(req.query.lista || "") === "1") {
      const aRes = await sql`
        SELECT DISTINCT ON (UPPER(codigo))
          codigo,
          institucion,
          grupo,
          curso
        FROM attempts
        WHERE institucion IS NOT NULL AND TRIM(institucion) <> ''
          AND grupo IS NOT NULL AND TRIM(grupo) <> ''
          AND curso IS NOT NULL AND TRIM(curso) <> ''
          AND codigo IS NOT NULL AND TRIM(codigo) <> ''
        ORDER BY UPPER(codigo), created_at DESC
      `;

      const filas = (aRes.rows || []).map((row) => ({
        codigo: norm(row.codigo).toUpperCase(),
        institucion: norm(row.institucion),
        grupo: norm(row.grupo),
        curso: norm(row.curso)
      }));

      return res.status(200).json({ valid: true, filas });
    }

    const institucion = norm(req.query.institucion);
    const grupo = norm(req.query.grupo);
    const curso = norm(req.query.curso);
    let prefijo = norm(req.query.codigo_prefijo).toUpperCase();

    if (!institucion || !grupo || !curso || !prefijo) {
      return res.status(400).json({
        valid: false,
        error: "Faltan institucion, grupo, curso o codigo_prefijo"
      });
    }

    if (!prefijo.endsWith("%")) {
      prefijo = prefijo + "%";
    }

    const aRes = await sql`
      SELECT DISTINCT ON (UPPER(codigo))
        codigo,
        nombre,
        institucion,
        grupo,
        curso,
        created_at,
        resultados
      FROM attempts
      WHERE UPPER(TRIM(institucion)) = UPPER(TRIM(${institucion}))
        AND UPPER(TRIM(grupo)) = UPPER(TRIM(${grupo}))
        AND UPPER(TRIM(curso)) = UPPER(TRIM(${curso}))
        AND UPPER(codigo) LIKE ${prefijo}
      ORDER BY UPPER(codigo), created_at DESC
    `;

    const rows = (aRes.rows || []).map((row) => ({
      codigo: row.codigo,
      nombre: row.nombre || "—",
      institucion: row.institucion || "—",
      grupo: row.grupo || "—",
      curso: row.curso || "—",
      created_at: row.created_at || null,
      ig_pct: igFromResultados(row.resultados)
    }));

    const conIg = rows.filter((r) => r.ig_pct != null);
    const promedio_ig =
      conIg.length > 0
        ? Math.round(conIg.reduce((s, r) => s + r.ig_pct, 0) / conIg.length)
        : null;

    return res.status(200).json({
      valid: true,
      filtro: { institucion, grupo, curso, codigo_prefijo: prefijo },
      total: rows.length,
      promedio_ig,
      miembros: rows
    });
  } catch (e) {
    console.error("report-group error", e);
    return res.status(500).json({ valid: false, error: "Error interno", detail: e.message });
  }
};
