module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Solo GET" });
  }
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ ok: true, ts: Date.now() });
};
