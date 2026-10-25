# NetDesk ISP System

Documentation: [REST API](docs/API.md) · [MCP server](docs/MCP.md)

[Operations, billing & report-import guide](docs/OPERATIONS.md) — POP/team/employee management, customer follow-ups, invoices, payments, assignment/history and source-report mapping. Existing installations: run `npm.cmd run db:migrate:operations`. New installations: use `npm.cmd run db:setup`. Operations/report reads and writes require the MCP key; uploaded real source reports are not automatically imported.

NetDesk is a simple ISP customer-care and support-ticket dashboard built with Next.js and MySQL. It provides customer account lookup, package management views, billing information, ticket tracking, and API documentation.

Repository: [github.com/tanvirahmmed8/NetDesk-ISP-System](https://github.com/tanvirahmmed8/NetDesk-ISP-System)

## Features

- Dynamic home analytics: account health, subscription value, new customer/ticket trends, support metrics, package distribution and payment schedules
- 7/30/90-day activity ranges, manual refresh and automatic 30-second polling

The home page (`/` or `/#dashboard`) reads live MySQL aggregates from `/api/analytics?days=30`. Metrics use Asia/Dhaka dates. Monthly package value estimates active subscriptions; it does not represent collected payments. Current-state cards show all current records, while the selected period controls new-record trends and resolution metrics. Database errors show a retry message instead of fabricated figures.

- Complete customer, package and ticket CRUD using list-page management tools
- CSV bulk uploads with downloadable templates, three-row preview and row-level results
- Ticket note viewer and duplicate complaint handling during imports

## Demo data management

Open Customer list, Package list or Ticket list. Use **Create**, or select a record and choose **View / Edit** or **Delete**. Customer CID is the stable identifier and cannot be renamed in the editor. Package IDs and ticket numbers are generated automatically.

Deleting a customer also deletes that customer's tickets and notes. Deleting a ticket removes its notes. A package with customers cannot be deleted; reassign those customers first.

Expand **Bulk upload** on any list page and download its CSV template. Keep the column headers, replace the example values, and choose your file. Review the preview and click **Import**. Uploads support quoted CSV fields, commas, multiline descriptions and UTF-8 text. Limits: 500 data rows and 2 MB per file. Successful rows are committed individually; failed rows show their CSV row number and reason. Correct and re-upload only failed rows to avoid duplicate records or repeated complaint notes.

Import packages first, then customers referencing their numeric `packageId`, then tickets referencing customer `cid`. Package templates create new plans; they do not update existing plans. Customer CIDs must be unique. Repeated complaints in an unresolved category are added as notes to the existing ticket.

Static CRUD API URLs:

| Method | Endpoint | Body |
|---|---|---|
| `POST` / `PUT` / `DELETE` | `/api/customers` | Customer fields; identify updates/deletes with `cid` |
| `POST` / `PUT` / `DELETE` | `/api/packages` | `name`, `speedMbps`, `price`; identify updates/deletes with `id` |
| `POST` / `PUT` / `DELETE` | `/api/tickets` | `cid`, `category`, `subject`, `description`, `priority`, `status`; identify updates/deletes with `ticketNo` |
| `POST` | `/api/import` | `{ "entity": "customers", "rows": [...] }` (also `packages` and `tickets`) |

`PUT` requires all editable fields. `DELETE` requires only the identifier. The UI uses the equivalent `/api/manage/customers`, `/api/manage/packages`, and `/api/manage/tickets` routes for validated writes. Customer and package list reads remain available at their existing URLs.

With MySQL and the application running, verify the demo CRUD workflow:

```powershell
node scripts/check-crud.mjs
```

This creates temporary check records, verifies updates, deletion guards and repeat-complaint notes, then removes those check records.

- Customer list with search
- Customer creation from the dashboard
- Customer lookup using CID
- Customer contact and installation information
- Current package, connection speed, and monthly price
- Next payment date and account status
- Internet package catalog
- Support ticket list and status management
- Customer-specific ticket history
- Duplicate complaint handling
- Developer API documentation
- OpenAPI 3.1 specification
- Responsive desktop, tablet, and mobile layout

## Ticket behavior

When a customer submits another complaint in the same category:

- If an existing ticket is `open` or `in_progress`, the complaint is added to that ticket as a note.
- If no unresolved ticket exists, a new ticket is created.

## Technology

- Next.js 15
- React 19
- TypeScript
- MySQL
- `mysql2`
- Lucide icons

## Requirements

- Node.js 20 or newer
- npm
- MySQL 8 or newer

## Installation

Clone the repository manually:

```powershell
git clone https://github.com/tanvirahmmed8/NetDesk-ISP-System.git
cd NetDesk-ISP-System
```

Install project dependencies:

```powershell
npm.cmd install
```

Create a `.env` file based on `.env.example`:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=isp_system
```

## Database setup

For an existing database, add the expanded package benefit/VAT fields safely:

```powershell
npm.cmd run db:migrate:packages
```

This migration is repeatable and preserves existing package records, prices and customer assignments. It adds unlimited usage, daily service hours, connection type, public IP count, one-time OTC, customer care hours and VAT settings. New-install schemas already contain these fields. Package forms, cards, customer details, CSV templates, REST APIs and MCP tools expose them. Existing three-column package CSV files still work. Set vatPercent=5 and vatIncluded=false to model a listed price plus 5% VAT; monthly totals exclude one-time OTC.

Run the included migration and seed script:

```powershell
npm.cmd run db:migrate
```

The migration creates:

- `packages`
- `customers`
- `tickets`
- `ticket_notes`

It also inserts sample packages, customers, and a support ticket.

> The current schema includes seed inserts and is intended for initial local setup. Running it repeatedly against an already-seeded database may create duplicate package records.

## Running the application

Start the development server:

```powershell
npm.cmd run dev
```

Open:

```text
http://localhost:3008
```

Create and run a production build:

```powershell
npm.cmd run build
npm.cmd run start
```

## Dashboard pages

| Page | URL |
|---|---|
| Customer list | `http://localhost:3008/#customers` |
| Ticket list | `http://localhost:3008/#tickets` |
| Package list | `http://localhost:3008/#packages` |
| Customer details | `http://localhost:3008/#details` |
| Developer API | `http://localhost:3008/#developer` |

## Sample customers

| CID | Customer | Status |
|---|---|---|
| `CID-10021` | Arif Rahman | Active |
| `CID-10022` | Nusrat Jahan | Active |
| `CID-10023` | Hasan Ali | Suspended |

## API overview

Customer lookup accepts CID or phone: `/api/customers?cid=CID-10021`, `/api/customers?phone=01711234567`, or `/api/customers?search=01711234567`. The old `cid` parameter also accepts phone fallback when no exact CID matches. Dashboard customer/ticket searches, MCP lookup and ticket create/import support phone numbers, including formatted and `+880` numbers. Shared phone numbers require a CID to avoid selecting the wrong account. See [API documentation](docs/API.md) and [MCP documentation](docs/MCP.md).

The local API base URL is:

```text
http://localhost:3008
```

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/customers` | List all customers |
| `POST` | `/api/customers` | Create a customer |
| `GET` | `/api/customers?cid={cid}` | Get customer details and tickets |
| `GET` | `/api/packages` | List internet packages |
| `GET` | `/api/tickets` | List all support tickets |
| `POST` | `/api/tickets` | Create a ticket or add a complaint note |
| `GET` | `/api/tickets?ticketNo={ticketNo}` | Get a ticket and its notes |
| `PATCH` | `/api/tickets` | Update status using `ticketNo` and `status` in the JSON body |
| `GET` | `/api/docs` | Get the OpenAPI 3.1 document |

### Customer lookup example

```http
GET /api/customers?cid=CID-10021
```

### Create customer example

```json
{
  "cid": "CID-10024",
  "name": "Rahim Ahmed",
  "phone": "01700111222",
  "email": "rahim@example.com",
  "address": "Dhaka",
  "packageId": 2,
  "nextPaymentDate": "2026-09-01",
  "accountStatus": "active"
}
```

### Create ticket example

```json
{
  "cid": "CID-10021",
  "category": "no_internet",
  "subject": "No connection",
  "description": "The connection has been unavailable since this morning.",
  "priority": "high"
}
```

Ticket categories:

- `no_internet`
- `slow_speed`
- `billing`
- `line_issue`
- `other`

Ticket statuses:

- `open`
- `in_progress`
- `resolved`
- `closed`

## OpenAPI documentation

The machine-readable OpenAPI document is available at:

```text
http://localhost:3008/api/docs
```

It can be imported into Postman, Insomnia, Swagger UI, and other OpenAPI-compatible tools.

## Project structure

```text
app/
  api/                  API route handlers
  globals.css           Dashboard styles
  layout.tsx            Root application layout
  page.tsx              Dashboard interface
database/
  schema.sql            Database schema and seed data
lib/
  db.ts                 MySQL connection pool
  http.ts               API error handling
scripts/
  migrate.mjs           Database migration runner
```

## Security note

The local version does not require authentication. Before exposing it publicly, add user authentication, API authorization, rate limiting, input validation, audit logging, and HTTPS.
