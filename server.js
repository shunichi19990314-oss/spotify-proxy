const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const PORT = process.env.PORT || 3000;

// プロキ元オリジン取得
const getProxyOrigin = (req) => {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
};

app.use(
  "/",
  createProxyMiddleware({
    target: "https://open.spotify.com",
    changeOrigin: true,
    selfHandleResponse: false, // 本文はidそのまま流す（安定性最優先）

    onProxyReq: (proxyReq, req) => {
      proxyReq.setHeader("Host", "open.spotify.com");
      proxyReq.setHeader("Origin", "https://open.spotify.com");
      proxyReq.setHeader("Referer", "https://open.spotify.com/");
    },

    onProxyRes: (proxyRes, req, res) => {
      const proxyOrigin = getProxyOrigin(req);

      // セキュリティヘッダーを緩和
      delete proxyRes.headers["content-security-policy"];
      delete proxyRes.headers["content-security-policy-report-only"];
      delete proxyRes.headers["x-frame-options"];

      // Location ヘッダーだけ書き換え（リダイレクトをできるだけプロキ内に留める）
      if (proxyRes.headers.location) {
        let loc = proxyRes.headers.location;
        loc = loc
          .replace(/https?:\/\/open\.spotify\.com/gi, proxyOrigin)
          .replace(/https?:\/\/accounts\.spotify\.com/gi, proxyOrigin);
        proxyRes.headers.location = loc;
      }

      // Cookie の Domain を削除
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
