#!/usr/bin/env node
// seller-fees-mcp: stdio MCP server. MIT License.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as T from './tools.js';

const server = new McpServer({ name: 'seller-fees-mcp', version: '1.0.0' });
const platform = z.enum(['gumroad', 'stripe', 'paypal', 'etsy']);
const opts = {
  discover: z.boolean().optional().describe('Gumroad: sale came through Gumroad Discover (flat 30%, processing included)'),
  high_volume: z.boolean().optional().describe('Gumroad: 5% + $0.50 tier (paid sales this calendar month reached $20,000)'),
  processing: z.enum(['card', 'none']).optional().describe('Gumroad direct: add card processing 2.9% + $0.30 (default card)'),
  type: z.enum(['checkout', 'venmo', 'card', 'goods', 'paylater', 'other']).optional().describe('PayPal payment type (default checkout)'),
  international: z.boolean().optional().describe('PayPal: international buyer (+1.50%)'),
  extra_pct: z.number().min(0).max(20).optional().describe('Stripe: extra % for international cards or currency conversion'),
  qty: z.number().int().min(1).optional().describe('Etsy: items in the order'),
  shipping: z.number().min(0).optional().describe('Etsy: shipping charged to the buyer'),
  gift_wrap: z.number().min(0).optional().describe('Etsy: gift wrap charged'),
  sales_tax_pct: z.number().min(0).max(50).optional().describe('Etsy: sales tax % on the order'),
  offsite_ads: z.enum(['none', 'std', 'low']).optional().describe('Etsy: Offsite Ads fee (std 15%, low 12%)')
};
const out = r => ({ content: [{ type: 'text', text: JSON.stringify(r, null, 2) }], structuredContent: r });
const wrap = fn => async a => { try { return out(await fn(a)); } catch (e) { return { isError: true, content: [{ type: 'text', text: e.message }] }; } };

server.registerTool('fee', { title: 'Seller fee for one sale',
  description: 'Fee and net amount for one sale on Gumroad, Stripe, PayPal or Etsy (US sellers, USD). Gumroad direct sales include the 2.9% + $0.30 card processing by default.',
  inputSchema: { platform, amount: z.number().min(0).describe('Sale price in USD (Etsy: item price)'), ...opts } }, wrap(T.fee));
server.registerTool('payout', { title: 'Payout after fees',
  description: 'What you keep per sale and in total for a number of units, after platform and processing fees.',
  inputSchema: { platform, amount: z.number().min(0).describe('Sale price in USD'), units: z.number().int().min(1).optional().describe('Number of sales (default 1)'), ...opts } }, wrap(T.payout));
server.registerTool('price_for_target', { title: 'Price for a target payout',
  description: 'Lowest price (rounded up to the cent) that leaves at least the target amount after fees.',
  inputSchema: { platform, target: z.number().min(0).describe('Amount you want to keep per sale, USD'),
    cost_per_item: z.number().min(0).optional().describe('Etsy: your cost per item'), label_cost: z.number().min(0).optional().describe('Etsy: shipping label cost'), ...opts } }, wrap(T.price));
server.registerTool('compare', { title: 'Compare platforms',
  description: 'Fee and net for one price across Gumroad direct, Gumroad Discover, Stripe, PayPal (checkout, card, goods) and Etsy, best net first.',
  inputSchema: { amount: z.number().min(0).describe('Sale price in USD') } }, wrap(T.compare));
server.registerTool('platforms', { title: 'Rates and sources', description: 'Default rates, options and official source pages for each platform.', inputSchema: {} }, wrap(T.platforms));

await server.connect(new StdioServerTransport());
