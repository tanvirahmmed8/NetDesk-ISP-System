# NetDesk MCP documentation

The server now exposes **31 tools**, including protected operations, ledger records and report import review. See [Operations guide](OPERATIONS.md) for the ten additional tool names, accepted data and import rules. Customer/ticket create/update tools accept the operational metadata shown in the UI. get_customer/get_ticket include operational details and activity history.

NetDesk exposes its customer-care workflow through the official MCP TypeScript SDK at:

```text
http://localhost:3008/mcp/v1
```

Transport: **Streamable HTTP**, stateless JSON responses. Use an HTTP-capable MCP client; this URL is an MCP JSON-RPC endpoint, not a REST endpoint or browser page. It supports initialization, tool discovery/calls, resources, resource templates, prompts and ping. There is no standalone SSE subscription, legacy `/sse` endpoint or persistent MCP session.

`MCP_API_KEY` in `.env` is required and must contain at least 32 characters. Send it as `Authorization: Bearer YOUR_KEY`. A missing server key returns HTTP 503; a missing/wrong client key returns 401. Restart the application after changing environment variables. The key is not returned by any endpoint.

For browser-based MCP clients, set `MCP_ALLOWED_ORIGINS` to a comma-separated list of exact trusted origins. The default permits `http://localhost:3008` and `http://127.0.0.1:3008`. For a deployed browser client, include its actual origin, for example `https://netdesk.example.com`. Native MCP clients usually omit Origin. This is bearer-token protection, not an OAuth login flow.

Example HTTP MCP configuration (for clients using `mcpServers`):

```json
{
  "mcpServers": {
    "netdesk": {
      "type": "http",
      "url": "http://localhost:3008/mcp/v1",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_API_KEY"
      }
    }
  }
}
```

Replace the placeholder with the key from your local `.env`. On CloudPanel use `https://YOUR_DOMAIN/mcp/v1`; keep the existing app port 3008. Configuration syntax varies by MCP client. Clients requiring OAuth discovery need a separate OAuth integration; they cannot use this static bearer-token setup directly.

Available tools:

Package tools accept `unlimited`, `serviceHours` (1–24), `connectionType` (fiber_optics/wireless/ethernet/other), `publicIpCount`, `otcCharge`, `supportHours`, `vatPercent` (0–100), and `vatIncluded`, in addition to name/speedMbps/price. These optional fields are available on create, update, list, get and bulk_import. Omitted fields use legacy-compatible defaults on creation and remain unchanged on updates. Responses include computed monthlyTotal/vatAmount. OTC is one-time; VAT is included in or added to price according to vatIncluded.

Package tools accept `unlimited`, `serviceHours` (1–24), `connectionType` (fiber_optics/wireless/ethernet/other), `publicIpCount`, `otcCharge`, `supportHours`, `vatPercent` (0–100), and `vatIncluded`, in addition to name/speedMbps/price. These optional fields are available on create, update, list, get and bulk_import. Omitted fields use legacy-compatible defaults on creation and remain unchanged on updates. Responses include computed monthlyTotal/vatAmount. OTC is one-time; VAT is included in or added to price according to vatIncluded.

| Tools | Purpose |
|---|---|
| `list_customers`, `get_customer`, `create_customer`, `update_customer`, `delete_customer` | Customer CRUD |
| `list_packages`, `get_package`, `create_package`, `update_package`, `delete_package` | Package CRUD |
| `list_tickets`, `get_ticket`, `create_ticket`, `update_ticket`, `delete_ticket` | Ticket CRUD |
| `set_ticket_status` | Update ticket status without resending all fields |
| `create_ticket_note`, `update_ticket_note`, `delete_ticket_note` | Manage notes; retrieve them with `get_ticket` |
| `bulk_import` | Import up to 500 row objects, with partial success and row-level results |
| `dashboard_summary` | Counts of customers, packages, tickets and overdue accounts |

List tools accept `search`, `limit` (1–100; default 50), `offset`, and customer/ticket `status`. Updates require all editable fields. Tool responses include both text and structured data. Business/database failures return `isError: true`. Customer deletion removes its tickets/notes; package deletion is blocked while subscribed. Duplicate unresolved complaints still append notes. The MCP import accepts parsed row objects; upload CSV through the dashboard or parse your CSV before calling the tool.

Example `tools/call` JSON-RPC request:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_customer",
    "arguments": { "cid": "CID-10021" }
  }
}
```

MCP clients perform the initialization handshake automatically. Raw HTTP requests need `Content-Type: application/json`, `Accept: application/json, text/event-stream`, the bearer header, and the negotiated MCP protocol version on subsequent requests.

Resources: `netdesk://guide`, `netdesk://customers/{cid}`, `netdesk://tickets/{ticketNo}`. Prompt: `customer_support_review`, with a `cid` argument.

Customer lookup also supports `get_customer({"phone":"01711234567"})`; the review prompt accepts `phone` instead of `cid`. Phone formatting, `+880` and local numbers are normalized. Existing `get_customer({"cid":"01711234567"})` calls try exact CID before phone fallback. Multiple customers sharing a phone return an error; use a CID to disambiguate.

`create_ticket`, `update_ticket` and ticket rows in `bulk_import` accept `phone` instead of `cid`. If both are sent, they must identify the same customer. Customer creation still needs a unique CID, and customer update/delete tools use the stable CID.

Customer lookup also supports `get_customer({"phone":"01711234567"})`; the review prompt accepts `phone` instead of `cid`. Phone formatting, `+880` and local numbers are normalized. Existing `get_customer({"cid":"01711234567"})` calls try exact CID before phone fallback. Multiple customers sharing a phone return an error; use a CID to disambiguate.

`create_ticket`, `update_ticket` and ticket rows in `bulk_import` accept `phone` instead of `cid`. If both are sent, they must identify the same customer. Customer creation still needs a unique CID, and customer update/delete tools use the stable CID.

Verify the transport and SDK integration:

```powershell
npm.cmd run check:mcp
```

The check builds into `.next-mcp-check`, starts an isolated server on port 3018 using a temporary key, checks tools/resources/prompts/authentication, and stops it. It does not change `.env` or database records. If MySQL is unavailable, the check reports the handled database error separately. `node scripts/check-crud.mjs` performs the database mutation checks against the running app and cleans up its temporary records.


## Allowed origins settings

Open **Settings** in the dashboard. Add a full HTTP/HTTPS origin, then click **Save changes** using the current MCP key. Remove entries with **Remove** and save again. An empty list blocks all browser origins while native clients without Origin can still authenticate.

Settings are stored in `.data/mcp-settings.json` and override `MCP_ALLOWED_ORIGINS` from `.env`. Changes apply immediately and survive restarts. Keep `.data` on persistent storage when deploying; file permissions must allow the site user to write it. Multiple instances must share that directory or use a shared settings store. Never put the MCP key in this file.

API reference is separate: [REST API documentation](API.md).

