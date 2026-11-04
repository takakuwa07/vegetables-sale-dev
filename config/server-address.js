// ── 🌐 サーバーの案内用アドレス ───────────────────────────
// PCのネットワーク情報から、利用者に案内するサーバーのIPを選ぶ。
// 特定のIPだけ表示名を kasumori.com に変え、接続先の案内に使う。

import { networkInterfaces } from 'node:os';

// この端末だけ、案内URLのIPをkasumori.comとして表示する。
const dnsAddress = '192.168.11.2';

// 端末のネットワーク一覧から、内部通信用を除くIPv4を重複なしで集める。
export function getServerAddress(interfaces = networkInterfaces()) {
  const addresses = [...new Set(Object.values(interfaces).flat()
    .filter(network => network?.family === 'IPv4' && !network.internal)
    .map(network => network.address))];

  // 対象PCではDNS用IPを最優先する。それ以外は192.系、最初の外部IPの順。
  // 外部IPがないときだけ、この端末内で接続できる127.0.0.1を使う。
  return addresses.find(address => address === dnsAddress)
    || addresses.find(address => address.startsWith('192.'))
    || addresses[0]
    || '127.0.0.1';
}

// 自身と表示対象がどちらも指定IPの場合だけ、案内用の名前に変える。
// 通信に使うIPやアクセスログのIPは変更しない。
export function getDisplayHost(address, serverAddress) {
  return serverAddress === dnsAddress && address === dnsAddress
    ? 'kasumori.com'
    : address;
}
