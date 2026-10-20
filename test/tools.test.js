import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as T from '../src/tools.js';

test('fee: Gumroad direct includes 2.9% + $0.30 card processing', async () => {
  const r = await T.fee({ platform: 'gumroad', amount: 19 });
  assert.equal(r.fee, 3.25); assert.equal(r.net, 15.75);
  assert.equal((await T.fee({ platform: 'gumroad', amount: 19, processing: 'none' })).net, 16.6);
  assert.equal((await T.fee({ platform: 'gumroad', amount: 19, discover: true })).net, 13.3);
  const hv = await T.fee({ platform: 'gumroad', amount: 100, high_volume: true });
  assert.equal(hv.breakdown.gumroad_fee, 5.5); assert.equal(hv.breakdown.processing, 3.2); assert.equal(hv.net, 91.3);
});
test('fee: Stripe, PayPal, Etsy match verified examples', async () => {
  assert.equal((await T.fee({ platform: 'stripe', amount: 100 })).fee, 3.2);
  assert.equal((await T.fee({ platform: 'paypal', amount: 100 })).fee, 3.98);
  assert.equal((await T.fee({ platform: 'paypal', amount: 100, type: 'goods' })).fee, 2.99);
  assert.equal((await T.fee({ platform: 'paypal', amount: 100, international: true })).fee, 5.48);
  assert.equal((await T.fee({ platform: 'etsy', amount: 25 })).net, 22.17);
  assert.equal((await T.fee({ platform: 'etsy', amount: 25, qty: 2, shipping: 6.95, sales_tax_pct: 8, offsite_ads: 'std' })).fee, 14.74);
});
test('payout totals', async () => {
  const p = await T.payout({ platform: 'gumroad', amount: 29, units: 10 });
  assert.equal(p.payout_per_sale, 24.46); assert.equal(p.total_payout, 244.6);
});
test('price_for_target round-trips', async () => {
  for (const platform of ['gumroad', 'stripe', 'paypal', 'etsy']) {
    const r = await T.price({ platform, target: 20 });
    assert.ok(r.net_at_price >= 20, platform);
  }
});
test('compare sorted by net', async () => {
  const r = await T.compare({ amount: 50 });
  assert.equal(r.results.length, 7);
  for (let i = 1; i < r.results.length; i++) assert.ok(r.results[i - 1].net >= r.results[i].net);
});
test('bad input errors', async () => { await assert.rejects(T.fee({ platform: 'shopify', amount: 5 })); });

test('stdio server lists 5 tools and answers a call', async () => {
  const p = spawn(process.execPath, [new URL('../src/server.js', import.meta.url).pathname]);
  let buf = ''; const waiters = {};
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); waiters[m.id]?.(m); } });
  const rpc = (id, method, params) => new Promise(res => { waiters[id] = res; p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  await rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const l = await rpc(2, 'tools/list', {});
  assert.deepEqual(l.result.tools.map(t => t.name).sort(), ['compare', 'fee', 'payout', 'platforms', 'price_for_target']);
  const c = await rpc(3, 'tools/call', { name: 'fee', arguments: { platform: 'stripe', amount: 100 } });
  assert.equal(c.result.structuredContent.net, 96.8);
  p.kill();
});
