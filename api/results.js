// Shared results store for the 11206 Load Test dashboard.
// Talks to an Upstash Redis database (free tier on the Vercel Marketplace) over its REST API.
// No npm dependencies: Node 18+ has fetch built in.
//
// GET    /api/results            -> { ok:true, results:{ id:{...} } }
// POST   /api/results            -> body { id, record }      upserts one student's record (newer timestamp wins)
// POST   /api/results            -> body { records:{ id:record } }  bulk upsert (used by Import)
// DELETE /api/results            -> header x-admin-key must equal ADMIN_KEY env var; wipes everything

const HASH = "ics11206:results";

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(...cmd) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

async function readAll() {
  const flat = (await redis("HGETALL", HASH)) || [];
  const out = {};
  for (let i = 0; i < flat.length; i += 2) {
    try { out[flat[i]] = JSON.parse(flat[i + 1]); } catch (e) {}
  }
  return out;
}

function isLogged(r) {
  return r && (r.w != null || r.c != null || r.b1 != null || r.f2 != null);
}

function clean(rec) {
  return {
    w: rec.w == null || rec.w === "" ? null : Number(rec.w),
    c: rec.c == null || rec.c === "" ? null : Number(rec.c),
    b1: typeof rec.b1 === "boolean" ? rec.b1 : null,
    f2: typeof rec.f2 === "boolean" ? rec.f2 : null,
    ts: Number(rec.ts) || Date.now(),
  };
}

async function upsert(id, rec) {
  if (typeof id !== "string" || id.length > 200) return null;
  const incoming = clean(rec);
  const cur = await redis("HGET", HASH, id);
  if (cur) {
    try {
      const prev = JSON.parse(cur);
      if (prev.ts && prev.ts > incoming.ts) return prev; // server copy is newer; keep it
    } catch (e) {}
  }
  if (!isLogged(incoming)) {
    await redis("HDEL", HASH, id);
    return null;
  }
  await redis("HSET", HASH, id, JSON.stringify(incoming));
  return incoming;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (!URL_ || !TOKEN) {
    return res.status(500).json({ ok: false, error: "Database not connected. Add the Upstash Redis integration to this Vercel project." });
  }

  try {
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, results: await readAll() });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      if (body.records && typeof body.records === "object") {
        const out = {};
        for (const id of Object.keys(body.records).slice(0, 2000)) {
          out[id] = await upsert(id, body.records[id] || {});
        }
        return res.status(200).json({ ok: true, results: out });
      }
      if (body.id) {
        const rec = await upsert(body.id, body.record || {});
        return res.status(200).json({ ok: true, id: body.id, record: rec });
      }
      return res.status(400).json({ ok: false, error: "Expected { id, record } or { records }" });
    }

    if (req.method === "DELETE") {
      const key = process.env.ADMIN_KEY;
      if (!key || req.headers["x-admin-key"] !== key) {
        return res.status(403).json({ ok: false, error: "Admin key required" });
      }
      await redis("DEL", HASH);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
};
