const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const PORT = process.env.PORT || 3000;

// プロキ元オリジン
const getProxyOrigin = (req) => {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
};

// ターゲット決定
const resolveTarget = (req) => {
  const path = (req.url || "").split("?")[0];
  if (
    path.startsWith("/login") ||
    path.startsWith("/api/login") ||
    path.startsWith("/xhr") ||
    path.startsWith("/oauth2") ||
    path.startsWith("/authorize") ||
    path.startsWith("/check-cookie") ||
    path.startsWith("/status") ||
    path.startsWith("/logout") ||
    path.startsWith("/api/token") ||
    path.includes("accounts")
  ) {
    return "https://accounts.spotify.com";
  }
  return "https://open.spotify.com";
};

app.use(
  "/",
  createProxyMiddleware({
    target: "https://open.spotify.com",
    changeOrigin: true,
    selfHandleResponse: false,
    router: (req) => resolveTarget(req),

    onProxyReq: (proxyReq, req) => {
      const target = resolveTarget(req);
      const host = target.replace("https://", "");
      proxyReq.setHeader("Host", host);
      proxyReq.setHeader("Origin", target);
      proxyReq.setHeader("Referer", target + "/");
    },

    onProxyRes: (proxyRes, req) => {
      const proxyOrigin = getProxyOrigin(req);

      // セキュリティヘッダー緩和
      delete proxyRes.headers["content-security-policy"];
      delete proxyRes.headers["content-security-policy-report-only"];
      delete proxyRes.headers["x-frame-options"];

      // Location ヘッダーを Render ドメインに書き換え
      if (proxyRes.headers.location) {
        let loc = proxyRes.headers.location;
        loc = loc
          .replace(/https?:\/\/accounts\.spotify\.com/gi, proxyOrigin)
          .replace(/https?:\/\/open\.spotify\.com/gi, proxyOrigin)
          .replace(/https?:\/\/www\.spotify\.com/gi, proxyOrigin);
        proxyRes.headers.location = loc;
      }

      // Cookie の Domain 削除
      if (proxyRes.headers["set-cookie"]) {
        const cookies = Array.isArray(proxyRes.headers["set-cookie"])
          ? proxyRes.headers["set-cookie"]
          : [proxyRes.headers["set-cookie"]];
        proxyRes.headers["set-cookie"] = cookies.map((c) =>
          c.replace(/Domain=[^;]+;?/gi, "").replace(/;\s*Secure/gi, "")
        );
      }
    },

    onError: (err, req, res) => {
      console.error("Proxy error:", err.message);
      res.status(500).send("Proxy error");
    },
  })
);

app.listen(PORT, () => {
  console.log(`Spotify proxy running on port ${PORT}`);
});
