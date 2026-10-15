const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const PORT = process.env.PORT || 3000;

// プロキ元のオリジンを取得
const getProxyOrigin = (req) => {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
};

// Spotify ドメイン → プロキドメイン へ置換
const rewriteSpotifyUrls = (text, proxyOrigin) => {
  if (!text || typeof text !== "string") return text;
  return text
    .replace(/https?:\/\/accounts\.spotify\.com/gi, proxyOrigin)
    .replace(/https?:\/\/open\.spotify\.com/gi, proxyOrigin)
    .replace(/https?:\/\/www\.spotify\.com/gi, proxyOrigin)
    .replace(/https?:\/\/spotify\.com/gi, proxyOrigin)
    .replace(/\/\/accounts\.spotify\.com/gi, proxyOrigin.replace(/^https?:/, ""))
    .replace(/\/\/open\.spotify\.com/gi, proxyOrigin.replace(/^https?:/, ""));
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
    selfHandleResponse: true,
    router: (req) => resolveTarget(req),

    onProxyReq: (proxyReq, req) => {
      const target = resolveTarget(req);
      const host = target.replace("https://", "");

      proxyReq.setHeader("Host", host);
      proxyReq.setHeader("Origin", target);
      proxyReq.setHeader("Referer", target + "/");

      // 圧縮を無効化（本文書き換えを安定化）
      proxyReq.setHeader("Accept-Encoding", "identity");

      proxyReq.removeHeader("x-forwarded-host");
      proxyReq.removeHeader("x-forwarded-proto");
    },

    onProxyRes: (proxyRes, req, res) => {
      const proxyOrigin = getProxyOrigin(req);

      // セキュリティヘッダー削除
      const headers = { ...proxyRes.headers };
      delete headers["content-security-policy"];
      delete headers["content-security-policy-report-only"];
      delete headers["x-frame-options"];
      delete headers["strict-transport-security"];
      delete headers["content-encoding"]; // identity なので不要
      delete headers["content-length"];

      // CORS
      headers["access-control-allow-origin"] = "*";
      headers["access-control-allow-credentials"] = "true";

      // Location 書き換え
      if (headers.location) {
        headers.location = rewriteSpotifyUrls(headers.location, proxyOrigin);
      }

      // Set-Cookie 調整
      if (headers["set-cookie"]) {
        const cookies = Array.isArray(headers["set-cookie"])
          ? headers["set-cookie"]
          : [headers["set-cookie"]];
        headers["set-cookie"] = cookies.map((cookie) =>
          cookie
            .replace(/Domain=[^;]+;?/gi, "")
            .replace(/;\s*Secure/gi, "")
            .replace(/SameSite=None/gi, "SameSite=Lax")
        );
      }

      const contentType = headers["content-type"] || "";
      const shouldRewrite =
        contentType.includes("text/html") ||
        contentType.includes("javascript") ||
        contentType.includes("application/json") ||
        contentType.includes("text/plain");

      if (!shouldRewrite) {
        // バイナリ系はそのまま流す
        res.writeHead(proxyRes.statusCode, headers);
        proxyRes.pipe(res);
        return;
      }

      // テキスト系はバッファしてURL置換
      const chunks = [];
      proxyRes.on("data", (chunk) => chunks.push(chunk));
      proxyRes.on("end", () => {
        try {
          let text = Buffer.concat(chunks).toString("utf8");
          text = rewriteSpotifyUrls(text, proxyOrigin);
          const body = Buffer.from(text, "utf8");

          headers["content-length"] = body.length;
          res.writeHead(proxyRes.statusCode, headers);
          res.end(body);
        } catch (err) {
          console.error("Rewrite error:", err.message);
          res.writeHead(proxyRes.statusCode, headers);
          res.end(Buffer.concat(chunks));
        }
      });

      proxyRes.on("error", (err) => {
        console.error("ProxyRes error:", err.message);
        if (!res.headersSent) {
          res.status(500).end("Proxy response error");
        }
      });
    },

    onError: (err, req, res) => {
      console.error("Proxy error:", err.message);
      if (!res.headersSent) {
        res.status(500).send("Proxy error: " + err.message);
      }
    },
  })
);

app.listen(PORT, () => {
  console.log(`Spotify proxy running on port ${PORT}`);
});
