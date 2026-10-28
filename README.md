# seller-fees-mcp

A free Model Context Protocol (MCP) server that works out seller fees, payouts and break-even prices for **Gumroad, Stripe, PayPal and Etsy** (US sellers, USD). Everything runs locally: no API key, no account, no network calls.

## Tools

| Tool | What it does |
|---|---|
| `fee` | Fee and net for one sale. Gumroad direct includes the 2.9% + $0.30 card processing; options `discover`, `high_volume`, `processing` (`card`/`none`). PayPal `type` and `international`, Stripe `extra_pct`, Etsy `qty`, `shipping`, `sales_tax_pct`, `offsite_ads`. |
| `payout` | What you keep per sale and in total for `units` sales. |
| `price_for_target` | Lowest price that leaves at least `target` after fees. |
| `compare` | One price across Gumroad direct, Gumroad Discover, Stripe, PayPal (checkout, card, goods) and Etsy, best net first. |
| `platforms` | Default rates, options and official source pages. |

Default rates are as of Oct 20, 2026. Gumroad direct: 10% + $0.50 plus card processing 2.9% + $0.30 (5% + $0.50 with `high_volume`); Discover: 30% all-in. Stripe: 2.9% + $0.30. PayPal Checkout: 3.49% + $0.49. Etsy: $0.20 listing, 6.5% transaction, 3% + $0.25 processing. Check each platform's pricing page before relying on a number. Planning estimates only; not tax or accounting advice.

## Install

Requires Node.js 18 or newer.

### npx

```bash
npx -y seller-fees-mcp
```

### From source

```bash
git clone https://github.com/NarwhalThePong/seller-fees-mcp.git && cd seller-fees-mcp && npm install && npm test
node src/server.js
```

### Desktop MCP clients

Add to your client's MCP config file:

```json
{
  "mcpServers": {
    "seller-fees": { "command": "npx", "args": ["-y", "seller-fees-mcp"] }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{
  "mcpServers": {
    "seller-fees": { "command": "npx", "args": ["-y", "seller-fees-mcp"] }
  }
}
```

For a local checkout, use `"command": "node", "args": ["/path/to/seller-fees-mcp/src/server.js"]`.

## Example

`fee` with `{ "platform": "gumroad", "amount": 19 }` returns a fee of $3.25 ($2.40 Gumroad + $0.85 card processing) and a net of $15.75.

## Prefer a web page?

- Free Gumroad fee calculator: https://narwhalthepong.github.io/gumroad-license-check/gumroad-fee-calculator.html
- Free PayPal and Stripe fee calculator: https://narwhalthepong.github.io/gumroad-license-check/paypal-stripe-fee-calculator.html
- Free Etsy fee calculator: https://narwhalthepong.github.io/gumroad-license-check/etsy-fee-calculator.html
- Creator Payout Calculator Pro (browser extension, paid): https://paudrudis.gumroad.com/l/ijrzbz

**Disclosure:** these are our own products. The calculator pages are free; Creator Payout Calculator Pro is a paid product we sell.

## Prefer a spreadsheet?

[Seller Fee Formulas for Google Sheets](https://payhip.com/b/6tHXR), $9: custom functions such as `GUMROADFEE`, `STRIPEFEE`, `PAYPALFEE` and `ETSYFEE`, plus price solvers for the price you need to keep a target amount, on a whole column at once. Our own paid product (the MCP server stays free).

## License

MIT

<!-- mcp-name: io.github.NarwhalThePong/seller-fees-mcp -->
