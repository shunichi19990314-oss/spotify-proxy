const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  "/",
  createProxyMiddleware({
    target: "https://open.spotify.com",
    changeOrigin: true,
    // 本文はid一切触らない（最も安定）
    selfHandleResponse: false,

    onProxyReq: (proxyReq) => {
      proxyReq.setHeader("Host", "open.spotify.com");
      proxyReq.setHeader("Origin", "https://open.spotify.com");
      proxyReq.setHeader("Referer", "https://open.spotify.com/");
    },

    onProxyRes: (proxyRes) => {
      // セキュリティヘッダーを緩和
      delete proxyRes.headers["content-security-policy"];
      delete proxyRes.headers["content-security-policy-report-only"];
      delete proxyRes.headers["x-frame-options"];
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
