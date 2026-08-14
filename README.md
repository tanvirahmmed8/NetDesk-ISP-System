# NetDesk ISP System

NetDesk is a simple ISP customer-care and support-ticket dashboard built with Next.js and MySQL. It provides customer account lookup, package management views, billing information, ticket tracking, and API documentation.

Repository: [github.com/tanvirahmmed8/NetDesk-ISP-System](https://github.com/tanvirahmmed8/NetDesk-ISP-System)

## Features

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

The local API base URL is:

```text
http://localhost:3008
```

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/customers` | List all customers |
| `POST` | `/api/customers` | Create a customer |
| `GET` | `/api/customers/{cid}` | Get customer details and tickets |
| `GET` | `/api/packages` | List internet packages |
| `GET` | `/api/tickets` | List all support tickets |
| `POST` | `/api/tickets` | Create a ticket or add a complaint note |
| `GET` | `/api/tickets/{ticketNo}` | Get a ticket and its notes |
| `PATCH` | `/api/tickets/{ticketNo}/status` | Update ticket status |
| `GET` | `/api/docs` | Get the OpenAPI 3.1 document |

### Customer lookup example

```http
GET /api/customers/CID-10021
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
