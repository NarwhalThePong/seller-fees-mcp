// Tool logic: calls the Seller Fee API v1.1.0 handler in-process (no network, no API key).
import { handle } from './lib/api.js';

export const LINKS = {
  calculator: 'https://narwhalthepong.github.io/gumroad-license-check/gumroad-fee-calculator.html',
  paypalStripe: 'https://narwhalthepong.github.io/gumroad-license-check/paypal-stripe-fee-calculator.html',
  etsy: 'https://narwhalthepong.github.io/gumroad-license-check/etsy-fee-calculator.html',
  pro: 'https://paudrudis.gumroad.com/l/ijrzbz'
};

async function call(path, args) {
  const res = await handle(new Request('https://local' + path, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(Object.entries(args || {}).filter(([, v]) => v !== undefined))) }));
  const body = await res.json();
  if (res.status !== 200) { const e = new Error(body.error || 'Request failed'); e.status = res.status; throw e; }
  return body;
}

export const fee = a => call('/v1/fee', a);
export const price = a => call('/v1/price', a);
export const compare = a => call('/v1/compare', a);
export const platforms = () => call('/v1/platforms', {});
export async function payout(a) {
  const r = await fee(a);
  const units = a.units ?? 1;
  return { platform: r.platform, price: r.gross, units, fee_per_sale: r.fee, payout_per_sale: r.net,
    total_gross: +(r.gross * units).toFixed(2), total_fees: +(r.fee * units).toFixed(2), total_payout: +(r.net * units).toFixed(2),
    effective_rate_pct: r.effective_rate_pct, ...(r.breakdown ? { breakdown: r.breakdown } : {}), inputs: r.inputs,
    currency: 'USD', rates_as_of: r.rates_as_of, source: r.source };
}
