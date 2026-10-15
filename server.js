const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const PORT = process.env.PORT || 3000;

// Cloudflare Worker をプロキ
app.use(
  "/",
  createProxyMiddleware({
    target: "https://spotify.shunichi-0314.workers.dev",
    changeOrigin: true,
    selfHandleResponse: false,

    onProxyReq: (proxyReq) => {
      proxyReq.setHeader("Host", "spotify.shunichi-0314.workers.dev");
    },

    onError: (err, req, res) => {
      console.error("Proxy error:", err.message);
      res.status(500).send("Proxy error");
    },
  })
);

app.listen(PORT, () => {
  console.log(`Proxying Cloudflare Worker on port ${PORT}`);
});
