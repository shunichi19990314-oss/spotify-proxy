const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const zlib = require("zlib");

const app = express();
const PORT = process.env.PORT || 3000;

// プロキ元のドメインを取得
const getProxyOrigin = (req) => {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
};

// Spotify のドメインをプロキドメインに置き換える関数
const rewriteSpotifyUrls = (text, proxyOrigin) => {
  if (!text || typeof text !== "string") return text;

  return text
    // accounts.spotify.com
    .replace(/https?:\/\/accounts\.spotify\.com/gi, proxyOrigin)
    // open.spotify.com
    .replace(/https?:\/\/open\.spotify\.com/gi, proxyOrigin)
    // www.spotify.com / spotify.com
    .replace(/https?:\/\/www\.spotify\.com/gi, proxyOrigin)
    .replace(/https?:\/\/spotify\.com/gi, proxyOrigin)
    // protocol-relative
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
    selfHandleResponse: true, // 本文を自分で処理する
    router: (req) => resolveTarget(req),

    onProxyReq: (proxyReq, req) => {
      const target = resolveTarget(req);
      const host = target.replace("https://", "");

      proxyReq.setHeader("Host", host);
      proxyReq.setHeader("Origin", target);
      proxyReq.setHeader("Referer", target + "/");

      proxyReq.removeHeader("x-forwarded-host");
      proxyReq.removeHeader("x-forwarded-proto");
    },

    onProxyRes: (proxyRes, req, res) => {
      const proxyOrigin = getProxyOrigin(req);

      // セキュリティヘッダー削除
      delete proxyRes.headers["content-security-policy"];
      delete proxyRes.headers["content-security-policy-report-only"];
      delete proxyRes.headers["x-frame-options"];
      delete proxyRes.headers["strict-transport-security"];
      delete proxyRes.headers["content-length"]; // 本文変更後に再計算

      // CORS
      proxyRes.headers["access-control-allow-origin"] = "*";
      proxyRes.headers["access-control-allow-credentials"] = "true";

      // Location ヘッダー書き換え
      if (proxyRes.headers.location) {
        proxyRes.headers.location = rewriteSpotifyUrls(
          proxyRes.headers.location,
          proxyOrigin
        );
      }

      // Set-Cookie 調整
      if (proxyRes.headers["set-cookie"]) {
        const cookies = Array.isArray(proxyRes.headers["set-cookie"])
          ? proxyRes.headers["set-cookie"]
          : [proxyRes.headers["set-cookie"]];

        proxyRes.headers["set-cookie"] = cookies.map((cookie) =>
          cookie
            .replace(/Domain=[^;]+;?/gi, "")
            .replace(/;\s*Secure/gi, "")
            .replace(/SameSite=None/gi, "SameSite=Lax")
        );
      }

      // レスポンス本文を取得して書き換え
      const chunks = [];
      proxyRes.on("data", (chunk) => chunks.push(chunk));
      proxyRes.on("end", () => {
        let buffer = Buffer.concat(chunks);
        const encoding = proxyRes.headers["content-encoding"];

        // gzip / brotli 展開
        try {
          if (encoding === "gzip") {
            buffer = zlib.gunzipSync(buffer);
          } else if (encoding === "br") {
            buffer = zlib.brotliDecompressSync(buffer);
          } else if (encoding === "deflate") {
            buffer = zlib.inflateSync(buffer);
          }
        } catch (e) {
          // 展開失敗時はそのまま進める
        }

        const contentType = proxyRes.headers["content-type"] || "";
        let body = buffer;

        // HTML / JS / JSON などテキスト系だけURL置換
        if (
          contentType.includes("text/html") ||
          contentType.includes("javascript") ||
          contentType.includes("application/json") ||
          contentType.includes("text/plain")
        ) {
          let text = buffer.toString("utf8");
          text = rewriteSpotifyUrls(text, proxyOrigin);
          body = Buffer.from(text, "utf8");

          // content-encoding を外す（既に展開済み）
          delete proxyRes.headers["content-encoding"];
        }

        // ヘッダーをコピーして返す
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        res.end(body);
      });
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
