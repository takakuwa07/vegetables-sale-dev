// ── 🌐 サーバーの案内用アドレスを確認 ────────────────────
// 仮のネットワーク情報から、案内するIPの優先順位を調べる。
// 指定したPCのIPだけ表示用の名前へ変わることも確かめる。

import test from 'node:test';
import assert from 'node:assert/strict';
import { getServerAddress, getDisplayHost } from '../config/server-address.js';

const ipv4 = address => ({ family: 'IPv4', internal: false, address });

test('IPv4が複数あるときは192.から始まるアドレスを優先する', () => {
  const interfaces = {
    virtual: [ipv4('10.0.0.8')],
    lan: [ipv4('192.168.11.2')],
    loopback: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }]
  };
  assert.equal(getServerAddress(interfaces), '192.168.11.2');
  assert.equal(getServerAddress({ other: [ipv4('192.168.11.7')], lan: [ipv4('192.168.11.2')] }), '192.168.11.2');
  assert.equal(getServerAddress({ virtual: [ipv4('10.0.0.8')] }), '10.0.0.8');
  assert.equal(getServerAddress({}), '127.0.0.1');
});

test('自身が指定IPのPCである場合だけDNS名に変える', () => {
  assert.equal(getDisplayHost('192.168.11.2', '192.168.11.2'), 'kasumori.com');
  assert.equal(getDisplayHost('192.168.11.2', '192.168.11.7'), '192.168.11.2');
  assert.equal(getDisplayHost('192.168.11.7', '192.168.11.2'), '192.168.11.7');
});
