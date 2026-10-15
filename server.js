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

// 絶対URLをプロキドメインに置換
const rewriteAbsoluteUrls = (text, proxyOrigin) => {
  if (!text) return text;
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

      // 圧縮無効（安定化）
      proxyReq.setHeader("Accept-Encoding", "identity");

      proxyReq.removeHeader("x-forwarded-host");
      proxyReq.removeHeader("x-forwarded-proto");
    },

    onProxyRes: (proxyRes, req, res) => {
      const proxyOrigin = getProxyOrigin(req);
      const headers = { ...proxyRes.headers };

      // セキュリティヘッダー削除
      delete headers["content-security-policy"];
      delete headers["content-security-policy-report-only"];
      delete headers["x-frame-options"];
      delete headers["strict-transport-security"];
      delete headers["content-encoding"];
      delete headers["content-length"];

      // Location 書き換え
      if (headers.location) {
        headers.location = rewriteAbsoluteUrls(headers.location, proxyOrigin);
      }

      // Cookie 調整
      if (headers["set-cookie"]) {
        const cookies = Array.isArray(headers["set-cookie"])
          ? headers["set-cookie"]
          : [headers["set-cookie"]];
        headers["set-cookie"] = cookies.map((c) =>
          c
            .replace(/Domain=[^;]+;?/gi, "")
            .replace(/;\s*Secure/gi, "")
            .replace(/SameSite=None/gi, "SameSite=Lax")
        );
      }

      const contentType = (headers["content-type"] || "").toLowerCase();

      // HTML だけ本文を書き換え（JSは大きいので触らない）
      if (contentType.includes("text/html")) {
        const chunks = [];
        proxyRes.on("data", (chunk) => chunks.push(chunk));
        proxyRes.on("end", () => {
          try {
            let html = Buffer.concat(chunks).toString("utf8");
            html = rewriteAbsoluteUrls(html, proxyOrigin);
            const body = Buffer.from(html, "utf8");
            headers["content-length"] = body.length;
            res.writeHead(proxyRes.statusCode || 200, headers);
            res.end(body);
          } catch (e) {
            console.error("HTML rewrite error:", e.message);
            res.writeHead(proxyRes.statusCode || 200, headers);
            res.end(Buffer.concat(chunks));
          }
        });
        proxyRes.on("error", (err) => {
          console.error("proxyRes error:", err.message);
          if (!res.headersSent) res.status(502).end("Bad Gateway");
        });
      } else {
        // HTML以外はそのままストリーム
        res.writeHead(proxyRes.statusCode || 200, headers);
        proxyRes.pipe(res);
      }
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
