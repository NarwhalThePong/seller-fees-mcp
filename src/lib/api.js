// Seller Fee API: Cloudflare Worker. Fees, payouts and break-even prices for Gumroad, Stripe, PayPal and Etsy (US sellers, USD).
import * as C from './core.js';

const API_VERSION = '1.1.0';
const MAX_AMOUNT = 1e7, MAX_BATCH = 100;
const SOURCES = {
  gumroad: 'https://gumroad.com/help/article/66-gumroads-fees',
  stripe: 'https://stripe.com/pricing',
  paypal: 'https://www.paypal.com/us/business/paypal-business-fees',
  etsy: 'https://www.etsy.com/legal/fees/'
};
const PLATFORMS = [
  { id: 'gumroad', name: 'Gumroad', rates: { direct: '10% + $0.50 per sale, plus card processing 2.9% + $0.30 charged on top',
      high_volume: '5% + $0.50 (plus card processing) once your paid sales that calendar month reach $20,000',
      discover: '30% per sale, all processing included (sales through Gumroad Discover)' },
    options: ['discover', 'high_volume', 'processing', 'pct', 'fixed', 'card_pct', 'card_fixed', 'discover_pct'] },
  { id: 'stripe', name: 'Stripe', rates: { card: '2.9% + $0.30 per successful domestic card charge' }, options: ['extra_pct', 'pct', 'fixed'] },
  { id: 'paypal', name: 'PayPal', rates: { checkout: '3.49% + $0.49', venmo: '3.49% + $0.49', card: '2.99% + $0.49', goods: '2.99%',
      paylater: '4.99% + $0.49', other: '3.49% + $0.49', international: '+1.50%' }, options: ['type', 'international', 'pct', 'fixed', 'intl_pct'] },
  { id: 'etsy', name: 'Etsy', rates: { listing: '$0.20 per item', transaction: '6.5% of items + shipping + gift wrap',
      processing: '3% + $0.25 (US, on the order total incl. sales tax)', offsite_ads: '15% (or 12%), capped at $100 per order' },
    options: ['qty', 'shipping', 'gift_wrap', 'sales_tax_pct', 'offsite_ads', 'cost_per_item', 'label_cost'] }
].map(p => Object.assign(p, { source: SOURCES[p.id], rates_as_of: C.SFF_RATES_AS_OF }));

class Bad extends Error { constructor(m, s) { super(m); this.status = s || 400; } }
const r2 = n => Math.round(n * 100) / 100;
function json(body, status, extra) {
  return new Response(JSON.stringify(body, null, 2), { status: status || 200,
    headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' }, extra || {}) });
}
function num(o, k, { required = false, min = 0, max = MAX_AMOUNT, dflt } = {}) {
  const v = o[k];
  if (v === undefined || v === null || v === '') { if (required) throw new Bad(`"${k}" is required`); return dflt; }
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) throw new Bad(`"${k}" must be a number`);
  if (n < min || n > max) throw new Bad(`"${k}" must be between ${min} and ${max}`);
  return n;
}
function bool(o, k) {
  const v = o[k]; if (v === undefined || v === null || v === '') return false;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  if (['true', '1', 'yes'].includes(s)) return true;
  if (['false', '0', 'no'].includes(s)) return false;
  throw new Bad(`"${k}" must be true or false`);
}
function platformOf(o) {
  const p = String(o.platform || '').toLowerCase().trim();
  if (!SOURCES[p]) throw new Bad('"platform" must be one of: ' + Object.keys(SOURCES).join(', '));
  return p;
}
const pctOpt = (o, k) => num(o, k, { max: 99.99 });
const blankIfU = v => (v === undefined ? '' : v);

function paypalType(o) {
  const t = String(o.type || 'checkout').toLowerCase();
  if (!C.SFF_PAYPAL_[t]) throw new Bad('PayPal "type" must be one of: ' + Object.keys(C.SFF_PAYPAL_).join(', '));
  return t;
}
function etsyArgs(o) {
  const ads = String(o.offsite_ads || 'none').toLowerCase();
  if (!['none', 'std', 'low'].includes(ads)) throw new Bad('"offsite_ads" must be none, std or low');
  const qty = num(o, 'qty', { min: 1, max: 10000, dflt: 1 });
  if (!Number.isInteger(qty)) throw new Bad('"qty" must be a whole number');
  return { qty, shipping: num(o, 'shipping', { dflt: 0 }), gift: num(o, 'gift_wrap', { dflt: 0 }), tax: num(o, 'sales_tax_pct', { max: 50, dflt: 0 }), ads };
}

// Gumroad: verified Oct 20, 2026 at gumroad.com/help/article/66-gumroads-fees. Direct sales pay 10% + $0.50 (5% + $0.50 after
// $20k paid sales in the calendar month) PLUS card processing 2.9% + $0.30 on top; Discover is a flat 30% that includes processing.
// Kept here (not in the generated core.js) so regenerating from Code.gs cannot drop the processing fee.
function gumroadArgs(o) {
  const proc = String(o.processing || 'card').toLowerCase();
  if (!['card', 'none'].includes(proc)) throw new Bad('Gumroad "processing" must be card or none');
  const d = bool(o, 'discover'), hv = bool(o, 'high_volume');
  return { discover: d, high_volume: hv, processing: d ? 'included' : proc,
    pct: pctOpt(o, 'pct') ?? (hv ? 5 : 10), fixed: num(o, 'fixed', { max: 1000 }) ?? 0.5, discover_pct: pctOpt(o, 'discover_pct') ?? 30,
    card_pct: num(o, 'card_pct', { max: 20 }) ?? 2.9, card_fixed: num(o, 'card_fixed', { max: 1000 }) ?? 0.3 };
}
function gumroadFee(amount, g) {
  if (amount <= 0) return { total: 0, gumroad: 0, processing: 0 };
  if (g.discover) { const t = r2(amount * g.discover_pct / 100); return { total: t, gumroad: t, processing: 0 }; }
  const gf = r2(amount * g.pct / 100 + g.fixed), pf = g.processing === 'card' ? r2(amount * g.card_pct / 100 + g.card_fixed) : 0;
  return { total: r2(gf + pf), gumroad: gf, processing: pf };
}
function gumroadPrice(target, g) {
  const keep = pr => r2(pr - gumroadFee(pr, g).total) >= target;
  const p = g.discover ? g.discover_pct : g.pct + (g.processing === 'card' ? g.card_pct : 0);
  const f = g.discover ? 0 : g.fixed + (g.processing === 'card' ? g.card_fixed : 0);
  if (p >= 100) throw new Bad('That target is not reachable with these Gumroad fees', 422);
  let pr = Math.ceil((target + f) / (1 - p / 100) * 100 - 1e-9) / 100;
  while (!keep(pr)) pr = r2(pr + 0.01);
  return pr;
}

// One fee calculation. Returns the full result object.
function fee(o) {
  const p = platformOf(o), amount = num(o, 'amount', { required: true });
  let f, gross = amount, used, breakdown;
  if (p === 'gumroad') {
    const g = gumroadArgs(o), r = gumroadFee(amount, g);
    f = r.total; breakdown = { gumroad_fee: r.gumroad, processing: r.processing };
    used = g.discover ? { channel: 'discover', pct: g.discover_pct, fixed: 0, processing: 'included' }
      : { channel: 'direct', high_volume: g.high_volume, pct: g.pct, fixed: g.fixed, processing: g.processing,
          ...(g.processing === 'card' ? { card_pct: g.card_pct, card_fixed: g.card_fixed } : {}) };
  } else if (p === 'stripe') {
    const pc = pctOpt(o, 'pct'), fx = num(o, 'fixed', { max: 1000 }), x = num(o, 'extra_pct', { max: 20 });
    f = C.STRIPEFEE(amount, blankIfU(pc), blankIfU(fx), blankIfU(x));
    used = { pct: pc ?? 2.9, fixed: fx ?? 0.3, extra_pct: x ?? 0 };
  } else if (p === 'paypal') {
    const t = paypalType(o), intl = bool(o, 'international'), pc = pctOpt(o, 'pct'), fx = num(o, 'fixed', { max: 1000 }), ip = num(o, 'intl_pct', { max: 20 });
    f = C.PAYPALFEE(amount, t, intl, blankIfU(pc), blankIfU(fx), blankIfU(ip));
    const row = C.SFF_PAYPAL_[t];
    used = { type: t, pct: pc ?? row[0], fixed: fx ?? row[1], international: intl, intl_pct: intl ? (ip ?? 1.5) : 0 };
  } else {
    const e = etsyArgs(o);
    const r = C.sff_etsy_(amount, e.qty, e.shipping, e.gift, e.tax, e.ads);
    f = r2(r.fees); gross = r2(r.rev);
    breakdown = { listing: r2(r.list), transaction: r2(r.tf), processing: r2(r.pf), offsite_ads: r2(r.ads) };
    used = { item_price: amount, qty: e.qty, shipping: e.shipping, gift_wrap: e.gift, sales_tax_pct: e.tax, offsite_ads: e.ads };
  }
  const net = r2(gross - f);
  return { platform: p, gross, fee: f, net, effective_rate_pct: gross > 0 ? r2(f / gross * 100) : 0,
    ...(breakdown ? { breakdown } : {}), inputs: used, currency: 'USD', rates_as_of: C.SFF_RATES_AS_OF, source: SOURCES[p] };
}

// Lowest price that leaves at least `target` after fees.
function price(o) {
  const p = platformOf(o), target = num(o, 'target', { required: true });
  let pr, used;
  if (p === 'gumroad') {
    const g = gumroadArgs(o); pr = gumroadPrice(target, g);
    used = { channel: g.discover ? 'discover' : 'direct', high_volume: g.high_volume, processing: g.processing };
  } else if (p === 'stripe') {
    const x = num(o, 'extra_pct', { max: 20, dflt: 0 }); pr = C.BREAKEVENPRICE(target, 2.9 + x, 0.30, 0); used = { extra_pct: x };
  } else if (p === 'paypal') {
    const t = paypalType(o), intl = bool(o, 'international'), row = C.SFF_PAYPAL_[t];
    pr = C.BREAKEVENPRICE(target, row[0] + (intl ? 1.5 : 0), row[1], 0); used = { type: t, international: intl };
  } else {
    const e = etsyArgs(o), cost = num(o, 'cost_per_item', { dflt: 0 }), label = num(o, 'label_cost', { dflt: 0 });
    pr = C.ETSYPRICE(cost, target, e.qty, e.shipping, label, e.ads, e.tax);
    if (pr === 'not reachable') throw new Bad('That target is not reachable with these Etsy fees', 422);
    used = { qty: e.qty, shipping: e.shipping, sales_tax_pct: e.tax, offsite_ads: e.ads, cost_per_item: cost, label_cost: label, note: 'price is per item' };
  }
  const check = fee(Object.assign({}, o, { amount: pr }));
  return { platform: p, target, price: pr, fee_at_price: check.fee, net_at_price: check.net, inputs: used, currency: 'USD', rates_as_of: C.SFF_RATES_AS_OF };
}

function compare(o) {
  const amount = num(o, 'amount', { required: true });
  const rows = [
    ['gumroad', 'Gumroad direct (card)', {}], ['gumroad', 'Gumroad Discover', { discover: true }], ['stripe', 'Stripe card', {}],
    ['paypal', 'PayPal Checkout', { type: 'checkout' }], ['paypal', 'PayPal card', { type: 'card' }], ['paypal', 'PayPal goods & services', { type: 'goods' }],
    ['etsy', 'Etsy (1 item, no shipping)', {}]
  ].map(([p, label, extra]) => { const r = fee(Object.assign({ platform: p, amount }, extra)); return { label, platform: p, fee: r.fee, net: r.net, effective_rate_pct: r.effective_rate_pct }; });
  rows.sort((a, b) => b.net - a.net);
  return { amount, currency: 'USD', results: rows, rates_as_of: C.SFF_RATES_AS_OF };
}

function batch(o, fn) {
  if (!Array.isArray(o.items)) throw new Bad('"items" must be an array');
  if (o.items.length > MAX_BATCH) throw new Bad(`at most ${MAX_BATCH} items per request`);
  return { count: o.items.length, results: o.items.map((it, i) => {
    try { return fn(Object.assign({}, it)); } catch (e) { if (e instanceof Bad) return { index: i, error: e.message }; throw e; }
  }) };
}

async function params(req, url) {
  const o = Object.fromEntries(url.searchParams);
  if (req.method === 'POST') {
    let b; try { b = await req.json(); } catch { throw new Bad('Body must be JSON'); }
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Bad('Body must be a JSON object');
    Object.assign(o, b);
  }
  return o;
}

export async function handle(req, env = {}) {
  const url = new URL(req.url), path = url.pathname.replace(/\/+$/, '') || '/';
  if (req.method === 'OPTIONS') return json({}, 204, { 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': '*' });
  if (path === '/health') return json({ ok: true, version: API_VERSION });
  if (env.RAPIDAPI_PROXY_SECRET && req.headers.get('x-rapidapi-proxy-secret') !== env.RAPIDAPI_PROXY_SECRET)
    return json({ error: 'Unauthorized: call this API through RapidAPI' }, 401);
  if (!['GET', 'POST'].includes(req.method)) return json({ error: 'Method not allowed' }, 405);
  try {
    const o = await params(req, url);
    switch (path) {
      case '/v1/platforms': return json({ platforms: PLATFORMS, version: API_VERSION });
      case '/v1/fee': return json(fee(o));
      case '/v1/price': return json(price(o));
      case '/v1/compare': return json(compare(o));
      case '/v1/fee/batch': if (req.method !== 'POST') throw new Bad('Use POST', 405); return json(batch(o, fee));
      case '/v1/price/batch': if (req.method !== 'POST') throw new Bad('Use POST', 405); return json(batch(o, price));
      default: return json({ error: 'Not found', endpoints: ['/v1/platforms', '/v1/fee', '/v1/price', '/v1/compare', '/v1/fee/batch', '/v1/price/batch', '/health'] }, 404);
    }
  } catch (e) {
    if (e instanceof Bad) return json({ error: e.message }, e.status);
    return json({ error: 'Internal error' }, 500);
  }
}
export default { fetch: (req, env) => handle(req, env) };
