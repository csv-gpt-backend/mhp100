const { sql } = require("@vercel/postgres");
const {
  resolveEvalKey,
  validateCodigoEval,
  mismatchErrorMessage,
} = require("./eval-codigo");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Solo se permite GET" });
    }

    const codigoRaw = (req.query.codigo || "").trim();
    const codigo = codigoRaw.toUpperCase();
    const evalEsperada = req.query.eval || req.query.evaluacion || "";

    if (!codigo) {
      return res.status(400).json({ error: "Falta el código" });
    }

    const pRes = await sql`
      SELECT *
      FROM participants
      WHERE UPPER(codigo) = UPPER(${codigo})
      LIMIT 1
    `;

    if (!pRes.rows.length) {
      return res.status(404).json({ error: "Código no encontrado" });
    }

    const participante = pRes.rows[0];
    const evalKey = resolveEvalKey(codigo, participante);

    if (evalEsperada) {
      const check = validateCodigoEval(codigo, evalEsperada, participante);
      if (!check.ok) {
        return res.status(403).json({
          error: mismatchErrorMessage(check),
          eval_mismatch: true,
          eval_codigo: check.eval_codigo,
          eval_esperada: check.eval_esperada,
          eval_label_codigo: check.eval_label_codigo,
          eval_label_esperada: check.eval_label_esperada,
        });
      }
    }

    const aRes = await sql`
      SELECT COUNT(*)::int AS n
      FROM attempts
      WHERE UPPER(codigo) = UPPER(${codigo})
    `;
    const intentosUsados = aRes.rows[0]?.n || 0;
    const intentosMax = 1;

    const usado = intentosUsados >= intentosMax;
    const disponible = !usado;
    const estado = usado ? "completado" : "activo";

    return res.status(200).json({
      codigo: participante.codigo,
      nombre: participante.nombre,
      institucion: participante.institucion,
      grupo: participante.grupo,
      curso: participante.curso,
      puede_ver_resultado: participante.puede_ver_resultado,
      eval_key: evalKey || null,
      evaluacion: evalKey || null,

      intentos_max: intentosMax,
      intentos_usados: intentosUsados,
      usado,
      disponible,
      estado,
    });
  } catch (e) {
    console.error("lookup error", e);
    return res.status(500).json({ error: "Error interno" });
  }
};
