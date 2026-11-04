// ── 🖥️ 単一アプリの画面配信 ────────────────────────────
// 開発中はLiveReload、本番ではHTMLに版番号を埋め込んで更新を検知する。
// 読み込むHTMLは固定し、URLからサーバー内の任意ファイルを選ばせない。

import path from 'node:path';
import fs from 'node:fs/promises';

import express from 'express';

import { deploymentVersion } from './deployment.js';
import { addDevelopmentBadge } from './development-badge.js';
import application from '../config/application.js';

// 設定値はHTMLとして解釈させず、公開してよい画面設定だけをJSONとして渡す。
export function renderApplicationHtml(html, settings = application) {
  const values = {
    applicationTitle: settings.title,
    applicationLabel: settings.label,
    applicationInitial: [...settings.label][0],
    applicationVersion: settings.version,
    applicationDescription: settings.description,
    tableName: settings.data.table,
    qualifiedTable: settings.data.schema + '.' + settings.data.table,
  };
  const publicSettings = {
    label: settings.label, version: settings.version, apiPath: settings.data.apiPath,
  };

  return html.replace(/\{\{(applicationSettings|applicationTitle|applicationLabel|applicationInitial|applicationVersion|applicationDescription|tableName|qualifiedTable)\}\}/g, (_, name) => {
    if (name === 'applicationSettings') {
      return JSON.stringify(publicSettings).replaceAll('<', '\\u003c');
    }

    return String(values[name]).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  });
}

// 画面と静的ファイルの配信を登録し、開発時だけLiveReloadの停止用オブジェクトを返す。
export default async function setupFrontend(app, env) {
  const publicPath = path.resolve(import.meta.dirname, '../public');
  let liveReload;

  if (env.isDevelopment) {
    const { default: livereload } = await import('livereload');
    const { default: connectLiveReload } = await import('connect-livereload');

    liveReload = livereload.createServer({
      port: env.liveReloadPort,
      host: '0.0.0.0',
      exts: ['html', 'css', 'js', 'svg']
    });
    liveReload.watch(publicPath);

    app.use(connectLiveReload({
      port: env.liveReloadPort,
      include: [/\/$/, /\.html(?:\?|$)/],
      ignore: [/^\/api(?:\/|$)/]
    }));
  }

  // HTMLは毎回読み込み、開発の目印か本番の更新検知スクリプトを追加して返す。
  app.get(['/', '/index.html'], async (req, res, next) => {
    try {
      let html = await fs.readFile(path.join(publicPath, 'index.html'), 'utf8');
      html = renderApplicationHtml(html);

      if (env.isDevelopment) {
        html = addDevelopmentBadge(html);
      } else {
        // 版番号をHTML属性へ埋め込むため、属性を壊す可能性がある文字を取り除く。
        const safeVersion = deploymentVersion.replace(/[&<>"']/g, '');
        html = html.replace('</head>', `<script defer src="/deployment-update.js" data-version="${safeVersion}"></script>\n</head>`);
      }

      res.set('Cache-Control', 'no-store').type('html').send(html);
    } catch (error) {
      next(error);
    }
  });

  // HTMLは上の専用処理に任せ、CSS・JS・画像は再検証付きキャッシュで配信する。
  app.use(express.static(publicPath, {
    index: false,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }));

  return liveReload;
}
