// stripe-mock returns fixture lists regardless of filters; answer
// GET /v1/transfers?transfer_group=... from what was actually created here.
const http = require("http");
const created = new Map(); // transfer_group -> transfer
let lastCheckout = null; // form body of the latest POST /v1/checkout/sessions
http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/__last_checkout") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(lastCheckout ? Object.fromEntries(new URLSearchParams(lastCheckout)) : null));
    }
    if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") lastCheckout = body;
    if (req.method === "GET" && url.pathname === "/v1/transfers") {
      const g = url.searchParams.get("transfer_group");
      const t = created.get(g);
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ object: "list", url: "/v1/transfers", has_more: false, data: t ? [t] : [] }));
    }
    const r = await fetch("http://localhost:12111" + req.url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
    const text = await r.text();
    if (req.method === "POST" && url.pathname === "/v1/transfers" && r.ok) {
      const g = new URLSearchParams(body).get("transfer_group");
      created.set(g, { ...JSON.parse(text), id: "tr_shim_" + created.size, transfer_group: g });
      res.writeHead(r.status, { "content-type": "application/json" });
      return res.end(JSON.stringify(created.get(g)));
    }
    res.writeHead(r.status, { "content-type": "application/json" }); res.end(text);
  });
}).listen(12110, () => console.log("stripe shim on 12110"));
