module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Solo POST" });
  }
  res.setHeader("Cache-Control", "no-store");

  const body = req.body || {};
  let bytes = 0;

  if (typeof body.data === "string") {
    bytes = Buffer.byteLength(body.data, "utf8");
  } else if (typeof body === "string") {
    bytes = Buffer.byteLength(body, "utf8");
  } else if (Buffer.isBuffer(body)) {
    bytes = body.length;
  } else if (body && typeof body === "object") {
    bytes = Buffer.byteLength(JSON.stringify(body), "utf8");
  }

  return res.status(200).json({ ok: true, bytes });
};
