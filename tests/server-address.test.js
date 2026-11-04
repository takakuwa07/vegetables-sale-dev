// ── 🌐 サーバーの案内用アドレスを確認 ────────────────────
// 仮のネットワーク情報から、案内するIPの優先順位を調べる。
// 特定のPCやドメイン名に依存しないことを確かめる。

import test from 'node:test';
import assert from 'node:assert/strict';
import { getServerAddress } from '../config/server-address.js';

const ipv4 = address => ({ family: 'IPv4', internal: false, address });

test('172.系IPv4があればDNS用IPや192.系より優先する', () => {
  assert.equal(getServerAddress({
    lan: [ipv4('192.168.11.2'), ipv4('10.0.0.8')],
    ignored: [{ family: 'IPv4', internal: true, address: '172.16.0.1' },
      { family: 'IPv6', internal: false, address: '::1' }],
    business: [ipv4('172.20.10.5')],
  }), '172.20.10.5');
});

test('IPv4が複数あるときは192.から始まるアドレスを優先する', () => {
  const interfaces = {
    virtual: [ipv4('10.0.0.8')],
    lan: [ipv4('192.168.11.2')],
    loopback: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }]
  };
  assert.equal(getServerAddress(interfaces), '192.168.11.2');
  assert.equal(getServerAddress({ other: [ipv4('192.168.11.7')], lan: [ipv4('192.168.11.2')] }), '192.168.11.7');
  assert.equal(getServerAddress({ virtual: [ipv4('10.0.0.8')] }), '10.0.0.8');
  assert.equal(getServerAddress({}), '127.0.0.1');
});
