// Minimal stand-in for Supabase's gateway: /rest/v1 -> PostgREST, /auth/v1 -> tiny auth.
const http = require("http");
const crypto = require("crypto");
const { Client } = require(process.env.PG_MODULE);
const SECRET = process.env.JWT_SECRET;
const PGRST = "http://127.0.0.1:54330";
const db = new Client({ host: "127.0.0.1", port: 55432, user: "postgres", database: "e2e" });
db.connect();

const b64u = (b) => Buffer.from(b).toString("base64url");
function sign(payload) {
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64u(JSON.stringify(payload));
  const s = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}
function verify(token) {
  const [h, p, s] = (token || "").split(".");
  if (!s) return null;
  const e = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  if (e !== s) return null;
  return JSON.parse(Buffer.from(p, "base64url").toString());
}
const userObj = (u) => ({ id: u.id, aud: "authenticated", role: "authenticated", email: u.email,
  app_metadata: { provider: "email" }, user_metadata: {}, created_at: u.created_at, email_confirmed_at: u.created_at });
function session(u) {
  const now = Math.floor(Date.now() / 1000);
  const access_token = sign({ sub: u.id, role: "authenticated", aud: "authenticated", email: u.email, iat: now, exp: now + 3600 });
  return { access_token, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: `rt_${u.id}`, user: userObj(u) };
}
const passwords = new Map();
function send(res, code, obj) { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); }

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    try {
      if (url.pathname.startsWith("/rest/v1")) {
        const target = PGRST + url.pathname.replace("/rest/v1", "") + url.search;
        const headers = { ...req.headers }; delete headers.host; delete headers["content-length"];
        const r = await fetch(target, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
        const out = Buffer.from(await r.arrayBuffer());
        const h = {}; r.headers.forEach((v, k) => { if (!["content-encoding", "transfer-encoding", "content-length"].includes(k)) h[k] = v; });
        res.writeHead(r.status, h); return res.end(out);
      }
      if (url.pathname === "/auth/v1/signup") {
        const { email, password } = JSON.parse(body);
        const ex = await db.query("select * from auth.users where email=$1", [email]);
        if (ex.rows.length) return send(res, 422, { code: "user_already_exists", error_code: "user_already_exists", msg: "User already registered" });
        const r = await db.query("insert into auth.users(email) values($1) returning *", [email]);
        passwords.set(email, password);
        return send(res, 200, session(r.rows[0]));
      }
      if (url.pathname === "/auth/v1/token") {
        const gt = url.searchParams.get("grant_type");
        const b = JSON.parse(body || "{}");
        let u;
        if (gt === "password") {
          const r = await db.query("select * from auth.users where email=$1", [b.email]);
          if (!r.rows.length || passwords.get(b.email) !== b.password) return send(res, 400, { code: "invalid_credentials", error_code: "invalid_credentials", msg: "Invalid login credentials" });
          u = r.rows[0];
        } else if (gt === "refresh_token") {
          const id = String(b.refresh_token || "").replace("rt_", "");
          const r = await db.query("select * from auth.users where id=$1", [id]); u = r.rows[0];
          if (!u) return send(res, 400, { msg: "bad refresh" });
        }
        return send(res, 200, session(u));
      }
      if (url.pathname === "/auth/v1/user") {
        const claims = verify((req.headers.authorization || "").replace("Bearer ", ""));
        if (!claims || !claims.sub) return send(res, 401, { code: "bad_jwt", msg: "invalid JWT" });
        const r = await db.query("select * from auth.users where id=$1", [claims.sub]);
        return send(res, 200, userObj(r.rows[0]));
      }
      if (url.pathname === "/auth/v1/logout") { res.writeHead(204); return res.end(); }
      send(res, 404, { msg: `not faked: ${url.pathname}` });
    } catch (e) { console.error(e); send(res, 500, { msg: String(e) }); }
  });
}).listen(54321, () => console.log("fake supabase on 54321"));
