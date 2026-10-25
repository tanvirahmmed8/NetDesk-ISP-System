# NetDesk REST API

For AI client integration, see [MCP documentation](MCP.md). This document describes the REST endpoints used by the dashboard.

Base URL: `http://localhost:3008` locally, or your deployed application domain. Requests and responses use JSON. The demo business APIs do not require authentication. MCP origin settings writes require the MCP bearer key.

Operational metadata, report-import endpoints and customer/ticket deletion require the MCP bearer key. The legacy customer/package/ticket basic create/read/update endpoints remain demo APIs. See the [operations API and workflow reference](OPERATIONS.md) for new endpoints and fields. Customer due dates may now be null, and detailed issue types participate in duplicate complaint matching.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/analytics?days=30` | Live overview; days can be 7, 30 or 90 |
| GET | `/api/customers` | List customers |
| GET | `/api/customers?cid=CID-10021` | Customer and ten recent tickets |
| GET | `/api/customers?phone=01711234567` | Same customer details, looked up by phone |
| GET | `/api/customers?search=01711234567` | Single CID-or-phone lookup |
| GET | `/api/customers?phone=01711234567` | Same customer details, looked up by phone |
| GET | `/api/customers?search=01711234567` | Single CID-or-phone lookup |
| POST | `/api/customers` | Create customer |
| PUT | `/api/customers` | Update customer; include cid and all editable fields |
| DELETE | `/api/customers` | Delete customer; body `{ "cid": "CID-10021" }` |
| GET | `/api/packages` | List packages |
| POST | `/api/packages` | Create package |
| PUT | `/api/packages` | Update package; include id and all editable fields |
| DELETE | `/api/packages` | Delete unused package; body `{ "id": 1 }` |
| GET | `/api/tickets` | List tickets |
| GET | `/api/tickets?ticketNo=TKT-240001` | Ticket and notes |
| POST | `/api/tickets` | Create complaint or append duplicate complaint note |
| PUT | `/api/tickets` | Update ticket; include ticketNo and all editable fields |
| PATCH | `/api/tickets` | Change status; body `{ "ticketNo": "TKT-240001", "status": "resolved" }` |
| DELETE | `/api/tickets` | Delete ticket; body `{ "ticketNo": "TKT-240001" }` |
| POST | `/api/import` | Bulk import: entity and rows array, maximum 500 |
| GET | `/api/settings/mcp` | Current allowed origins and source; no keys returned |
| PUT | `/api/settings/mcp` | Save allowed origins, requires MCP bearer key |
| GET | `/api/docs` | OpenAPI specification for REST APIs |

## Example create bodies

Customer:

```json
{
  "cid": "DEMO-20001",
  "name": "Demo Customer",
  "phone": "01700123456",
  "email": "demo@example.com",
  "address": "Dhaka",
  "packageId": 1,
  "nextPaymentDate": "2026-12-01",
  "accountStatus": "active"
}
```

Package:

```json
{
  "name": "CONFIDENT+",
  "speedMbps": 200,
  "price": 2000,
  "unlimited": true,
  "serviceHours": 24,
  "connectionType": "fiber_optics",
  "publicIpCount": 0,
  "otcCharge": 0,
  "supportHours": "24/7",
  "vatPercent": 5,
  "vatIncluded": false
}
```

Package benefit fields are optional for compatibility. New packages default to 24-hour unlimited fiber, no public IP, zero OTC, 24/7 care, and zero VAT with price treated as inclusive. On PUT, omitted benefit fields preserve the saved values. Older CSV files with only name/speedMbps/price still import.

Package responses include the above fields plus `monthlyTotal` and `vatAmount`. The example package totals ৳2100/month (৳2000 + 5% VAT), with no OTC. For MINOR+ use price 500 and otcCharge 1000; for POSITIVE+ use price 2500, speedMbps 250 and publicIpCount 1. Set vatIncluded=true when price already includes VAT. OTC is never added to recurring monthly totals. Customer details include these benefit fields and `packageMonthlyTotal`; analytics uses VAT-adjusted recurring prices.

Ticket:

Package benefit fields are optional for compatibility. New packages default to 24-hour unlimited fiber, no public IP, zero OTC, 24/7 care, and zero VAT with price treated as inclusive. On PUT, omitted benefit fields preserve the saved values. Older CSV files with only name/speedMbps/price still import.

Package responses include the above fields plus `monthlyTotal` and `vatAmount`. The example package totals ৳2100/month (৳2000 + 5% VAT), with no OTC. For MINOR+ use price 500 and otcCharge 1000; for POSITIVE+ use price 2500, speedMbps 250 and publicIpCount 1. Set vatIncluded=true when price already includes VAT. OTC is never added to recurring monthly totals. Customer details include these benefit fields and `packageMonthlyTotal`; analytics uses VAT-adjusted recurring prices.

```json
{
  "cid": "DEMO-20001",
  "category": "no_internet",
  "subject": "No connection",
  "description": "Connection unavailable since morning",
  "priority": "high",
  "status": "open"
}
```

Categories: `no_internet`, `slow_speed`, `billing`, `line_issue`, `other`. Priority: `low`, `medium`, `high`, `urgent`. Ticket status: `open`, `in_progress`, `resolved`, `closed`. Customer status: `active`, `suspended`, `inactive`.

## CID or phone lookup

Phone lookup supports `01711-234567`, `01711234567`, `+8801711234567` and `008801711234567`. URL-encode phone values (especially the `+` sign). Existing `/api/customers?cid=01711234567` requests also work: exact CID is tried first, then phone. `search` accepts one CID-or-phone value and cannot be combined with other selectors. Omit all selectors to list customers; empty selectors return 400.

If the phone belongs to multiple customers, lookup returns 409 and asks for a CID. If `cid` and `phone` are both supplied, both must identify the same customer. A missing customer returns 404.

Ticket create/update and ticket bulk import also accept `phone` instead of `cid`:

```json
{
  "phone": "01711234567",
  "category": "slow_speed",
  "subject": "Low speed",
  "description": "Slow connection during the evening",
  "priority": "medium"
}
```

Use either a `cid` or a `phone` column for ticket CSV imports; both columns are supported. The duplicate-complaint rule uses the resolved customer, so complaints submitted using CID and phone merge into the same unresolved category ticket. Customer creation still requires a unique CID. Customer edits/deletes use the stable CID; their phone field is editable contact information.

## CID or phone lookup

Phone lookup supports `01711-234567`, `01711234567`, `+8801711234567` and `008801711234567`. URL-encode phone values (especially the `+` sign). Existing `/api/customers?cid=01711234567` requests also work: exact CID is tried first, then phone. `search` accepts one CID-or-phone value and cannot be combined with other selectors. Omit all selectors to list customers; empty selectors return 400.

If the phone belongs to multiple customers, lookup returns 409 and asks for a CID. If `cid` and `phone` are both supplied, both must identify the same customer. A missing customer returns 404.

Ticket create/update and ticket bulk import also accept `phone` instead of `cid`:

```json
{
  "phone": "01711234567",
  "category": "slow_speed",
  "subject": "Low speed",
  "description": "Slow connection during the evening",
  "priority": "medium"
}
```

Use either a `cid` or a `phone` column for ticket CSV imports; both columns are supported. The duplicate-complaint rule uses the resolved customer, so complaints submitted using CID and phone merge into the same unresolved category ticket. Customer creation still requires a unique CID. Customer edits/deletes use the stable CID; their phone field is editable contact information.

## Allowed-origin settings

GET returns `{ "success": true, "data": { "origins": ["https://client.example.com"], "source": "settings" } }`. Sources are `settings`, `environment`, or `default`.

PUT requires `Authorization: Bearer YOUR_MCP_API_KEY` and a body such as:

```json
{ "origins": ["http://localhost:3008", "https://client.example.com"] }
```

Origins must use HTTP/HTTPS and cannot contain credentials, paths, query parameters, fragments or wildcards. Up to 100 origins may be stored; duplicates are normalized. An empty array blocks all browser origins. Native MCP clients without an Origin header still require authentication.

UI settings take precedence over `.env` and apply immediately. They persist in `.data/mcp-settings.json`. Keep that directory writable and persistent when deploying.

## Results and behavior

Success returns `success: true` and data or a message. Failures return `success: false` with a message (settings authentication failures use an `error` string). Creation returns 201, duplicate complaints return 200 with `action: "note_added"`. Invalid input returns 400, missing records 404, conflicts 409, and server/database failures 500. Settings returns 401 for an invalid token or 503 if the server key is not configured.

Repeated complaints in an unresolved category become notes. Deleting customers also deletes their tickets and notes. Package deletion is blocked while subscribed. Bulk import commits each successful row independently and returns imported/failed counts plus row-level results; retry only failed rows.
