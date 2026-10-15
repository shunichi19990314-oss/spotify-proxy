const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const PORT = process.env.PORT || 3000;

// プロキ元のドメイン（Renderのドメインを自動取得）
const getProxyHost = (req) => {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
};

// ターゲットホストを決定
const resolveTarget = (req) => {
  const path = req.url || "";
  // ログイン関連のパスは accounts.spotify.com へ
  if (
    path.startsWith("/login") ||
    path.startsWith("/api/login") ||
    path.startsWith("/xhr/login") ||
    path.includes("accounts.spotify.com") ||
    path.startsWith("/oauth2") ||
    path.startsWith("/authorize") ||
    path.startsWith("/check-cookie") ||
    path.startsWith("/status") ||
    path.startsWith("/logout")
  ) {
    return "https://accounts.spotify.com";
  }
  // その他は open.spotify.com
  return "https://open.spotify.com";
};

app.use(
  "/",
  createProxyMiddleware({
    target: "https://open.spotify.com", // デフォルト
    changeOrigin: true,
    selfHandleResponse: false,
    // リクエストごとにターゲットを切り替え
    router: (req) => resolveTarget(req),

    onProxyReq: (proxyReq, req, res) => {
      const target = resolveTarget(req);
      const host = target.replace("https://", "");

      proxyReq.setHeader("Host", host);
      proxyReq.setHeader("Origin", target);
      proxyReq.setHeader("Referer", target + "/");

      // プロキ元の情報を消す
      proxyReq.removeHeader("x-forwarded-host");
      proxyReq.removeHeader("x-forwarded-proto");
    },

    onProxyRes: (proxyRes, req, res) => {
      const proxyOrigin = getProxyHost(req);

      // セキュリティヘッダーを削除
      delete proxyRes.headers["content-security-policy"];
      delete proxyRes.headers["content-security-policy-report-only"];
      delete proxyRes.headers["x-frame-options"];
      delete proxyRes.headers["strict-transport-security"];

      // CORS
      proxyRes.headers["access-control-allow-origin"] = "*";
      proxyRes.headers["access-control-allow-credentials"] = "true";

      // Location ヘッダーをプロキドメインに書き換え
      // → accounts.spotify.com や open.spotify.com へのリダイレクトを Render ドメインに変換
      if (proxyRes.headers.location) {
        let location = proxyRes.headers.location;

        location = location
          .replace(/https?:\/\/accounts\.spotify\.com/gi, proxyOrigin)
          .replace(/https?:\/\/open\.spotify\.com/gi, proxyOrigin)
          .replace(/https?:\/\/www\.spotify\.com/gi, proxyOrigin)
          .replace(/https?:\/\/spotify\.com/gi, proxyOrigin);

        proxyRes.headers.location = location;
      }

      // Set-Cookie の Domain を削除（プロキドメインで使えるように）
      if (proxyRes.headers["set-cookie"]) {
        const cookies = Array.isArray(proxyRes.headers["set-cookie"])
          ? proxyRes.headers["set-cookie"]
          : [proxyRes.headers["set-cookie"]];

        proxyRes.headers["set-cookie"] = cookies.map((cookie) => {
          return cookie
            .replace(/Domain=[^;]+;?/gi, "")
            .replace(/Secure;?/gi, "")
            .replace(/SameSite=None/gi, "SameSite=Lax");
        });
      }
    },

    onError: (err, req, res) => {
      console.error("Proxy error:", err.message);
      res.status(500).send("Proxy error: " + err.message);
    },
  })
);

app.listen(PORT, () => {
  console.log(`Spotify proxy running on port ${PORT}`);
});
