const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const PORT = process.env.PORT || 3000;

// Spotify へのリバースプロキシ
app.use(
  "/",
  createProxyMiddleware({
    target: "https://open.spotify.com",
    changeOrigin: true,
    selfHandleResponse: false,
    onProxyReq: (proxyReq, req, res) => {
      // Host を Spotify に合わせる
      proxyReq.setHeader("Host", "open.spotify.com");
      proxyReq.setHeader("Origin", "https://open.spotify.com");
      proxyReq.setHeader("Referer", "https://open.spotify.com/");
    },
    onProxyRes: (proxyRes, req, res) => {
      // セキュリティヘッダーを緩和（必要に応じて）
      delete proxyRes.headers["content-security-policy"];
      delete proxyRes.headers["content-security-policy-report-only"];
      delete proxyRes.headers["x-frame-options"];
      proxyRes.headers["access-control-allow-origin"] = "*";
    },
    // エラー時
    onError: (err, req, res) => {
      console.error("Proxy error:", err.message);
      res.status(500).send("Proxy error");
    },
  })
);

app.listen(PORT, () => {
  console.log(`Spotify proxy running on port ${PORT}`);
});
