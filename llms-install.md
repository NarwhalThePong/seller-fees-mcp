# llms-install.md — seller-fees-mcp

This is a zero-config, stdio MCP server. No API key, account, or network access is required; all calculations run locally.

## Install (recommended)
Requires Node.js 18+. Add this server to the client's MCP settings and run it with npx:

```json
{
  "mcpServers": {
    "seller-fees": {
      "command": "npx",
      "args": ["-y", "seller-fees-mcp"]
    }
  }
}
```

No environment variables are needed.

## Verify
After setup, the server exposes these tools: `fee`, `payout`, `price_for_target`, `compare`, `platforms`. A good smoke test is calling `platforms` (takes no arguments) and confirming it returns the default fee rates for Gumroad, Stripe, PayPal and Etsy.

## From source (optional)
```bash
git clone https://github.com/NarwhalThePong/seller-fees-mcp.git
cd seller-fees-mcp && npm install && npm test   # tests should pass
node src/server.js
```
