# Spotify Proxy

Spotify Web（open.spotify.com）およびログインページ（accounts.spotify.com）をリバースプロキする Node.js + Express アプリです。
Render などでデプロイできます。

## 機能

- `open.spotify.com` のプロキ
- `accounts.spotify.com`（ログインページ）のプロキ
- Location ヘッダーの書き換え（外部ドメインへのリダイレクトを防止）
- Cookie の Domain 属性を削除（プロキドメインで使用可能に）

## 使い方

1. このリポジトリを Render に接続
2. **Build Command**: `npm install`
3. **Start Command**: `npm start`

デプロイ後、サービスのURLで Spotify Web がプロキ経由で開きます。
ログインページも Render のドメイン上で表示されるようになっています。

## 注意

Spotify は高度な SPA で、認証や WebSocket、Cookie などが複雑なため、完全に動作しない可能性があります。
個人利用を推奨します。
