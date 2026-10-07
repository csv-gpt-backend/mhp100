const { sql } = require("@vercel/postgres");
const { normalizeIdioma } = require("./eval-codigo");

function en(lang) {
  return normalizeIdioma(lang) === "EN";
}

function upNombre(value) {
  return String(value || "").trim().toLocaleUpperCase("es-EC");
}

function parseResultados(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (e) {
    return null;
  }
}

function msg(key, lang) {
  const isEn = en(lang);
  const map = {
    method: isEn ? "Method not allowed." : "Método no permitido.",
    missing_code: isEn ? "Enter the code." : "Ingresa el código.",
    code_not_found: isEn ? "Code not found." : "Código no encontrado.",
    no_attempt: isEn
      ? "This code has no finished assessment yet."
      : "Este código aún no tiene una evaluación terminada.",
    missing_name: isEn ? "Name is required." : "Falta el nombre.",
    missing_last: isEn ? "Last name is required." : "Falta el apellido.",
    too_long: isEn ? "Name or last name is too long." : "El nombre o el apellido es demasiado largo.",
    bad_result: isEn
      ? "The saved result could not be read. Nothing was changed."
      : "No se pudo leer el resultado guardado. No se cambió nada.",
    save_error: isEn ? "Could not save the correction." : "No se pudo guardar la corrección.",
    saved: isEn ? "Name updated. The score was not changed." : "Nombre actualizado. El puntaje no cambió.",
  };
  return map[key] || (isEn ? "Error" : "Error");
}

module.exports = async function handler(req, res) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const lang =
    normalizeIdioma((req.query && (req.query.idioma || req.query.lang)) || body.idioma || body.lang || "") ||
    "ES";

  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return res.status(405).json({ ok: false, error: msg("method", lang) });
    }

    const codigoRaw = String((req.query && req.query.codigo) || body.codigo || "").trim();
    const codigo = codigoRaw.toUpperCase();
    if (!codigo) {
      return res.status(400).json({ ok: false, error: msg("missing_code", lang) });
    }

    const pRes = await sql`
      SELECT codigo, nombre
      FROM participants
      WHERE UPPER(codigo) = UPPER(${codigo})
      LIMIT 1
    `;
    if (!pRes.rows.length) {
      return res.status(404).json({ ok: false, error: msg("code_not_found", lang) });
    }

    const aRes = await sql`
      SELECT id, nombre, resultados
      FROM attempts
      WHERE UPPER(codigo) = UPPER(${codigo})
      ORDER BY created_at DESC
    `;
    if (!aRes.rows.length) {
      return res.status(404).json({ ok: false, error: msg("no_attempt", lang) });
    }

    const latest = aRes.rows[0];
    const latestRes = parseResultados(latest.resultados) || {};

    if (req.method === "GET") {
      const nombrePila = String(latestRes.nombre_pila || "").trim();
      const apellido = String(latestRes.apellido || "").trim();
      const nombreLinea = String(latest.nombre || pRes.rows[0].nombre || "").trim();
      return res.status(200).json({
        ok: true,
        codigo: codigo,
        nombre_pila: nombrePila,
        apellido: apellido,
        nombre: nombrePila || apellido ? "" : nombreLinea,
      });
    }

    const nombre = upNombre(body.nombre);
    const apellido = upNombre(body.apellido);
    if (!nombre) return res.status(400).json({ ok: false, error: msg("missing_name", lang) });
    if (!apellido) return res.status(400).json({ ok: false, error: msg("missing_last", lang) });
    if (nombre.length > 60 || apellido.length > 60) {
      return res.status(400).json({ ok: false, error: msg("too_long", lang) });
    }
    const joined = (nombre + " " + apellido).trim();
    const updates = [];
    for (const row of aRes.rows) {
      const parsed = parseResultados(row.resultados);
      if (!parsed) {
        return res.status(409).json({ ok: false, error: msg("bad_result", lang) });
      }
      parsed.nombre_pila = nombre;
      parsed.apellido = apellido;
      updates.push({ id: row.id, resultados: JSON.stringify(parsed) });
    }
    for (const row of updates) {
      await sql`
        UPDATE attempts
        SET nombre = ${joined},
            resultados = ${row.resultados}
        WHERE id = ${row.id}
      `;
    }

    await sql`
      UPDATE participants
      SET nombre = ${joined}
      WHERE UPPER(codigo) = UPPER(${codigo})
    `;

    return res.status(200).json({
      ok: true,
      codigo: codigo,
      nombre: nombre,
      apellido: apellido,
      message: msg("saved", lang),
    });
  } catch (err) {
    console.error("corregir-nombre", err);
    return res.status(500).json({ ok: false, error: msg("save_error", lang) });
  }
};
