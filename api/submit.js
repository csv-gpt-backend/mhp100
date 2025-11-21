const { sql } = require("@vercel/postgres");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Solo POST" });
  }

  try {
    const payload = req.body || {};
    const { codigo, snapshot, resultados, responses } = payload;

    if (!snapshot || !responses) {
      return res.status(400).json({ error: "Payload incompleto" });
    }

    const {
      nombre,
      edad_anios,
      institucion,
      grupo,
      curso,
      version_banco
    } = snapshot;

    const iie = resultados?.globales?.IIE ?? null;
    const iv1 = resultados?.globales?.IV1 ?? null;
    const iv2 = resultados?.globales?.IV2 ?? null;
    const iv3 = resultados?.globales?.IV3 ?? null;

    const b_intra = resultados?.bloques?.intrapersonales ?? null;
    const b_inter = resultados?.bloques?.interpersonales ?? null;
    const b_pv = resultados?.bloques?.para_la_vida ?? null;
    const b_estilos = resultados?.bloques?.estilos_comunicacion ?? null;
    const b_cambio = resultados?.bloques?.propension_cambio ?? null;

    await sql`
      INSERT INTO attempts (codigo, nombre, edad_anios, institucion, grupo, curso,
  iie, iv1, iv2, iv3, b_intra, b_inter, b_pv, b_estilos, b_cambio,
  resultados, responses)
VALUES (${codigo}, ${nombre}, ${edad}, ${inst}, ${grupo}, ${curso},
  ${iie}, ${iv1}, ${iv2}, ${iv3}, ${bIntra}, ${bInter}, ${bPV}, ${bEstilos}, ${bCambio},
  ${JSON.stringify(resultados)}, ${responses})
    `;

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error al guardar" });
  }
};
