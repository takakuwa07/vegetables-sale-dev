// ── 🖥️ 単一アプリの画面配信 ────────────────────────────
// 開発中はLiveReload、本番ではHTMLに版番号を埋め込んで更新を検知する。
// 読み込むHTMLは固定し、URLからサーバー内の任意ファイルを選ばせない。

import path from 'node:path';
import fs from 'node:fs/promises';
import express from 'express';
import { deploymentVersion } from './deployment.js';
import { addDevelopmentBadge } from './development-badge.js';

export default async function setupFrontend(app, env) {
  const publicPath = path.resolve(import.meta.dirname, '../public');
  let liveReload;
  if (env.isDevelopment) {
    const { default: livereload } = await import('livereload');
    const { default: connectLiveReload } = await import('connect-livereload');
    liveReload = livereload.createServer({ port: env.liveReloadPort, host: '0.0.0.0', exts: ['html', 'css', 'js', 'svg'] });
    liveReload.watch(publicPath);
    app.use(connectLiveReload({ port: env.liveReloadPort, include: [/\/$/, /\.html(?:\?|$)/], ignore: [/^\/api(?:\/|$)/] }));
  }
  app.get(['/', '/index.html'], async (req, res, next) => {
    try {
      let html = await fs.readFile(path.join(publicPath, 'index.html'), 'utf8');
      if (env.isDevelopment) {
        html = addDevelopmentBadge(html);
      } else {
        const safeVersion = deploymentVersion.replace(/[&<>"']/g, '');
        html = html.replace('</head>', `<script defer src="/deployment-update.js" data-version="${safeVersion}"></script>\n</head>`);
      }
      res.set('Cache-Control', 'no-store').type('html').send(html);
    } catch (error) {
      next(error);
    }
  });
  app.use(express.static(publicPath, { index: false, setHeaders(res) { res.setHeader('Cache-Control', 'no-cache'); } }));
  return liveReload;
}
