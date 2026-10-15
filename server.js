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

// ログイン関連だけ accounts へ（過剥なルーティングをやめる）
const resolveTarget = (req) => {
  const path = (req.url || "").split("?")[0];
  if (
    path === "/login" ||
    path.startsWith("/login/") ||
    path.startsWith("/oauth2") ||
    path.startsWith("/authorize") ||
    path.startsWith("/logout")
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

      // 必要最低限のヘッダーだけ設定
      proxyReq.setHeader("Host", host);

      // 元の User-Agent を守る（なければ一般的なものを設定）
      if (!req.headers["user-agent"]) {
        proxyReq.setHeader(
          "User-Agent",
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        );
      }
    },

    onProxyRes: (proxyRes, req) => {
      const proxyOrigin = getProxyOrigin(req);

      // CSP と X-Frame-Options だけ削除（他はidそのまま）
      delete proxyRes.headers["content-security-policy"];
      delete proxyRes.headers["content-security-policy-report-only"];
      delete proxyRes.headers["x-frame-options"];

      // Location 書き換え
      if (proxyRes.headers.location) {
        let loc = proxyRes.headers.location;
        loc = loc
          .replace(/https?:\/\/accounts\.spotify\.com/gi, proxyOrigin)
          .replace(/https?:\/\/open\.spotify\.com/gi, proxyOrigin);
        proxyRes.headers.location = loc;
      }

      // Cookie の Domain を削除（プロキドメインで使えるように）
      if (proxyRes.headers["set-cookie"]) {
        const cookies = Array.isArray(proxyRes.headers["set-cookie"])
          ? proxyRes.headers["set-cookie"]
          : [proxyRes.headers["set-cookie"]];
        proxyRes.headers["set-cookie"] = cookies.map((c) =>
          c.replace(/Domain=[^;]+;?/gi, "")
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
