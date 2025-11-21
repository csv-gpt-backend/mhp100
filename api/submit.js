const { sql } = require("@vercel/postgres");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Solo POST" });
  }

  try {
    const body = req.body || {};
    const codigoRaw = body.codigo;

    if (!codigoRaw) {
      return res.status(400).json({ error: "Falta codigo" });
    }

    const codigo = String(codigoRaw).trim().toUpperCase();

    const snapshot = body.snapshot || {};
    const resultados = body.resultados || {};
    const responses = body.responses || null;

    // --- snapshot ---
    const nombre = snapshot.nombre || null;
    const edad = snapshot.edad_anios ?? null;
    const institucion = snapshot.institucion || null;
    const grupo = snapshot.grupo || null;
    const curso = snapshot.curso || null;

    // --- globales / bloques desde resultados ---
    const g = resultados.globales || {};
    const b = resultados.bloques || {};

    const iie = g.IIE ?? null;
    const iv1 = g.IV1 ?? null;
    const iv2 = g.IV2 ?? null;
    const iv3 = g.IV3 ?? null;

    const b_intra = b.intrapersonales ?? null;
    const b_inter = b.interpersonales ?? null;
    const b_pv = b.para_la_vida ?? null;
    const b_estilos = b.estilos_comunicacion ?? null;
    const b_cambio = b.propension_cambio ?? null;

    await sql`
      INSERT INTO attempts (
        codigo, nombre, edad_anios, institucion, grupo, curso,
        iie, iv1, iv2, iv3,
        b_intra, b_inter, b_pv, b_estilos, b_cambio,
        resultados, responses
      )
      VALUES (
        ${codigo}, ${nombre}, ${edad}, ${institucion}, ${grupo}, ${curso},
        ${iie}, ${iv1}, ${iv2}, ${iv3},
        ${b_intra}, ${b_inter}, ${b_pv}, ${b_estilos}, ${b_cambio},
        ${JSON.stringify(resultados)},
        ${responses ? JSON.stringify(responses) : null}
      );
    `;

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("SUBMIT ERROR:", err);
    return res.status(500).json({ error: "Error al guardar", detail: err.message });
  }
};
