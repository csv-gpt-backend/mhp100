const { sql } = require("@vercel/postgres");

const CHC_ORDER = ["Gf", "Gq", "Gwm", "Gs", "Glr", "Gc", "Gv"];
const CHC_LABELS = {
  Gf: "Razonamiento fluido",
  Gq: "Razonamiento cuantitativo",
  Gwm: "Memoria de trabajo",
  Gs: "Velocidad de procesamiento",
  Glr: "Memoria asociativa / recuperación",
  Gc: "Comprensión verbal",
  Gv: "Procesamiento visual-espacial"
};

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

function habilidadesFromResultados(raw) {
  const r = parseResultados(raw);
  const list = Array.isArray(r && r.factores) ? r.factores : [];
  const byCode = {};
  list.forEach((f) => {
    if (!f || f.pct == null || f._pendiente) return;
    const code = String(f.code || "").trim();
    if (!code) return;
    const pct = Number(f.pct);
    if (Number.isNaN(pct)) return;
    byCode[code] = {
      code,
      label: String(f.label || CHC_LABELS[code] || code).trim(),
      pct: Math.round(Math.max(0, Math.min(100, pct)))
    };
  });

  const ordered = [];
  CHC_ORDER.forEach((code) => {
    if (byCode[code]) ordered.push(byCode[code]);
    delete byCode[code];
  });
  Object.keys(byCode)
    .sort()
    .forEach((code) => ordered.push(byCode[code]));
  return ordered;
}

function norm(v) {
  return String(v ?? "").trim();
}

async function listaFilas() {
  try {
    const aRes = await sql`
      SELECT DISTINCT ON (UPPER(a.codigo))
        a.codigo,
        a.institucion,
        a.grupo,
        a.curso,
        p.periodo,
        p.lote
      FROM attempts a
      LEFT JOIN participants p
        ON UPPER(TRIM(a.codigo)) = UPPER(TRIM(p.codigo))
      WHERE a.institucion IS NOT NULL AND TRIM(a.institucion) <> ''
        AND a.grupo IS NOT NULL AND TRIM(a.grupo) <> ''
        AND a.curso IS NOT NULL AND TRIM(a.curso) <> ''
        AND a.codigo IS NOT NULL AND TRIM(a.codigo) <> ''
      ORDER BY UPPER(a.codigo), a.created_at DESC
    `;
    return (aRes.rows || []).map((row) => ({
      codigo: norm(row.codigo).toUpperCase(),
      institucion: norm(row.institucion),
      grupo: norm(row.grupo),
      curso: norm(row.curso),
      periodo: norm(row.periodo),
      lote: norm(row.lote)
    }));
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    if (/lote/i.test(msg)) {
      try {
        const aRes = await sql`
          SELECT DISTINCT ON (UPPER(a.codigo))
            a.codigo,
            a.institucion,
            a.grupo,
            a.curso,
            p.periodo
          FROM attempts a
          LEFT JOIN participants p
            ON UPPER(TRIM(a.codigo)) = UPPER(TRIM(p.codigo))
          WHERE a.institucion IS NOT NULL AND TRIM(a.institucion) <> ''
            AND a.grupo IS NOT NULL AND TRIM(a.grupo) <> ''
            AND a.curso IS NOT NULL AND TRIM(a.curso) <> ''
            AND a.codigo IS NOT NULL AND TRIM(a.codigo) <> ''
          ORDER BY UPPER(a.codigo), a.created_at DESC
        `;
        return (aRes.rows || []).map((row) => ({
          codigo: norm(row.codigo).toUpperCase(),
          institucion: norm(row.institucion),
          grupo: norm(row.grupo),
          curso: norm(row.curso),
          periodo: norm(row.periodo),
          lote: ""
        }));
      } catch (_) {
        // fallthrough
      }
    }
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
    return (aRes.rows || []).map((row) => ({
      codigo: norm(row.codigo).toUpperCase(),
      institucion: norm(row.institucion),
      grupo: norm(row.grupo),
      curso: norm(row.curso),
      periodo: "",
      lote: ""
    }));
  }
}

async function consultarGrupo({ institucion, grupo, curso, periodo, lote, prefijo }) {
  // Con periodo + lote
  if (periodo && lote) {
    return sql`
      SELECT DISTINCT ON (UPPER(a.codigo))
        a.codigo, a.nombre, a.institucion, a.grupo, a.curso,
        a.created_at, a.resultados, p.periodo, p.lote
      FROM attempts a
      LEFT JOIN participants p
        ON UPPER(TRIM(a.codigo)) = UPPER(TRIM(p.codigo))
      WHERE UPPER(TRIM(a.institucion)) = UPPER(TRIM(${institucion}))
        AND UPPER(TRIM(a.grupo)) = UPPER(TRIM(${grupo}))
        AND UPPER(TRIM(a.curso)) = UPPER(TRIM(${curso}))
        AND UPPER(a.codigo) LIKE ${prefijo}
        AND UPPER(TRIM(COALESCE(p.periodo, ''))) = UPPER(TRIM(${periodo}))
        AND UPPER(TRIM(COALESCE(p.lote, ''))) = UPPER(TRIM(${lote}))
      ORDER BY UPPER(a.codigo), a.created_at DESC
    `;
  }
  // Solo lote
  if (lote) {
    return sql`
      SELECT DISTINCT ON (UPPER(a.codigo))
        a.codigo, a.nombre, a.institucion, a.grupo, a.curso,
        a.created_at, a.resultados, p.periodo, p.lote
      FROM attempts a
      LEFT JOIN participants p
        ON UPPER(TRIM(a.codigo)) = UPPER(TRIM(p.codigo))
      WHERE UPPER(TRIM(a.institucion)) = UPPER(TRIM(${institucion}))
        AND UPPER(TRIM(a.grupo)) = UPPER(TRIM(${grupo}))
        AND UPPER(TRIM(a.curso)) = UPPER(TRIM(${curso}))
        AND UPPER(a.codigo) LIKE ${prefijo}
        AND UPPER(TRIM(COALESCE(p.lote, ''))) = UPPER(TRIM(${lote}))
      ORDER BY UPPER(a.codigo), a.created_at DESC
    `;
  }
  // Solo periodo
  if (periodo) {
    return sql`
      SELECT DISTINCT ON (UPPER(a.codigo))
        a.codigo, a.nombre, a.institucion, a.grupo, a.curso,
        a.created_at, a.resultados, p.periodo, p.lote
      FROM attempts a
      LEFT JOIN participants p
        ON UPPER(TRIM(a.codigo)) = UPPER(TRIM(p.codigo))
      WHERE UPPER(TRIM(a.institucion)) = UPPER(TRIM(${institucion}))
        AND UPPER(TRIM(a.grupo)) = UPPER(TRIM(${grupo}))
        AND UPPER(TRIM(a.curso)) = UPPER(TRIM(${curso}))
        AND UPPER(a.codigo) LIKE ${prefijo}
        AND UPPER(TRIM(COALESCE(p.periodo, ''))) = UPPER(TRIM(${periodo}))
      ORDER BY UPPER(a.codigo), a.created_at DESC
    `;
  }
  // Sin periodo ni lote
  try {
    return await sql`
      SELECT DISTINCT ON (UPPER(a.codigo))
        a.codigo, a.nombre, a.institucion, a.grupo, a.curso,
        a.created_at, a.resultados, p.periodo, p.lote
      FROM attempts a
      LEFT JOIN participants p
        ON UPPER(TRIM(a.codigo)) = UPPER(TRIM(p.codigo))
      WHERE UPPER(TRIM(a.institucion)) = UPPER(TRIM(${institucion}))
        AND UPPER(TRIM(a.grupo)) = UPPER(TRIM(${grupo}))
        AND UPPER(TRIM(a.curso)) = UPPER(TRIM(${curso}))
        AND UPPER(a.codigo) LIKE ${prefijo}
      ORDER BY UPPER(a.codigo), a.created_at DESC
    `;
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    if (!/periodo|lote|column/i.test(msg)) throw e;
    return sql`
      SELECT DISTINCT ON (UPPER(codigo))
        codigo, nombre, institucion, grupo, curso, created_at, resultados
      FROM attempts
      WHERE UPPER(TRIM(institucion)) = UPPER(TRIM(${institucion}))
        AND UPPER(TRIM(grupo)) = UPPER(TRIM(${grupo}))
        AND UPPER(TRIM(curso)) = UPPER(TRIM(${curso}))
        AND UPPER(codigo) LIKE ${prefijo}
      ORDER BY UPPER(codigo), created_at DESC
    `;
  }
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Solo GET" });
    }

    if (String(req.query.lista || "") === "1") {
      const filas = await listaFilas();
      return res.status(200).json({ valid: true, filas });
    }

    const institucion = norm(req.query.institucion);
    const grupo = norm(req.query.grupo);
    const curso = norm(req.query.curso);
    const periodo = norm(req.query.periodo);
    const lote = norm(req.query.lote);
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

    let aRes;
    try {
      aRes = await consultarGrupo({ institucion, grupo, curso, periodo, lote, prefijo });
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      if (/lote/i.test(msg)) {
        return res.status(500).json({
          valid: false,
          error:
            "Falta la columna lote en participants. Ejecute en Neon: ALTER TABLE participants ADD COLUMN IF NOT EXISTS lote TEXT;"
        });
      }
      if (/periodo/i.test(msg)) {
        return res.status(500).json({
          valid: false,
          error:
            "Falta la columna periodo en participants. Ejecute en Neon: ALTER TABLE participants ADD COLUMN IF NOT EXISTS periodo TEXT;"
        });
      }
      throw e;
    }

    const columnsMap = new Map();
    CHC_ORDER.forEach((code) => {
      columnsMap.set(code, CHC_LABELS[code] || code);
    });

    const rows = (aRes.rows || []).map((row) => {
      const habilidades = habilidadesFromResultados(row.resultados);
      const scores = {};
      habilidades.forEach((h) => {
        scores[h.code] = h.pct;
        if (!columnsMap.has(h.code)) columnsMap.set(h.code, h.label);
        else if (h.label) columnsMap.set(h.code, h.label);
      });
      return {
        codigo: row.codigo,
        nombre: row.nombre || "—",
        institucion: row.institucion || "—",
        grupo: row.grupo || "—",
        curso: row.curso || "—",
        periodo: norm(row.periodo) || "—",
        lote: norm(row.lote) || "—",
        created_at: row.created_at || null,
        ig_pct: igFromResultados(row.resultados),
        scores,
        habilidades
      };
    });

    const columnas = [];
    CHC_ORDER.forEach((code) => {
      if (columnsMap.has(code)) {
        columnas.push({ code, label: columnsMap.get(code) });
        columnsMap.delete(code);
      }
    });
    [...columnsMap.entries()].forEach(([code, label]) => {
      columnas.push({ code, label });
    });

    const promedios = {};
    columnas.forEach((col) => {
      const vals = rows
        .map((r) => r.scores[col.code])
        .filter((v) => v != null && !Number.isNaN(v));
      promedios[col.code] =
        vals.length > 0
          ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)
          : null;
    });

    const conIg = rows.filter((r) => r.ig_pct != null);
    const promedio_ig =
      conIg.length > 0
        ? Math.round(conIg.reduce((s, r) => s + r.ig_pct, 0) / conIg.length)
        : null;

    return res.status(200).json({
      valid: true,
      filtro: {
        institucion,
        grupo,
        curso,
        periodo: periodo || null,
        lote: lote || null,
        codigo_prefijo: prefijo
      },
      total: rows.length,
      promedio_ig,
      columnas,
      promedios,
      miembros: rows
    });
  } catch (e) {
    console.error("report-group error", e);
    return res.status(500).json({ valid: false, error: "Error interno", detail: e.message });
  }
};
