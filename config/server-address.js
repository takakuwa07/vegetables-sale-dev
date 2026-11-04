// ── 🌐 サーバーの案内用アドレス ───────────────────────────
// PCのネットワーク情報から、利用者に案内するサーバーのIPを選ぶ。

import { networkInterfaces } from 'node:os';

// 端末のネットワーク一覧から、内部通信用を除くIPv4を重複なしで集める。
// 起動ログのURLを作るための選択であり、サーバーの待受設定を変更する処理ではない。
export function getServerAddress(interfaces = networkInterfaces()) {
  const addresses = [...new Set(Object.values(interfaces).flat()
    .filter(network => network?.family === 'IPv4' && !network.internal)
    .map(network => network.address))];

  // 起動PCの172.系IPv4を最優先する。ない場合は192.系、その他の順。
  // 外部IPがないときだけ、この端末内で接続できる127.0.0.1を使う。
  return addresses.find(address => address.startsWith('172.'))
    || addresses.find(address => address.startsWith('192.'))
    || addresses[0]
    || '127.0.0.1';
}
