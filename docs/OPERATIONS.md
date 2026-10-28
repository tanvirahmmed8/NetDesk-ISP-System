# Operations, billing and report imports

Open `/#operations` for POPs, Teams, Employees, Issue types, Follow-ups, Invoices and Payments. Open `/#imports` for report mapping and review. Sign in at `/login` to access these sections; no MCP key is needed in the UI. All REST APIs require a dashboard session or bearer key. See [Login setup](AUTH.md).

## Setup

For an existing database:

```powershell
npm.cmd run db:migrate:operations
```

This repeatable migration preserves existing records, adds operational tables and columns, makes unknown customer due dates nullable, and seeds issue types. Run `db:migrate:packages` first if the package-fields migration has not been applied.

For a new database, set `.env` then run `npm.cmd run db:setup`. Initial setup creates base tables and sample data; do not run initial setup against existing tables. Both migrations target `DB_NAME` from `.env`.

## Customer operations

Customer list → Operational fields & activity → sign in → View/Edit → Edit operational details. District, upazila, POP, customer type, registration date/status, agreed MRC/OTC and imported payment status are editable. Agreed MRC is the customer's final VAT-inclusive recurring charge; it overrides the standard package monthly total without adding VAT twice. A null override uses the package charge. Customer profile includes a protected Billing & follow-up section.

Registration status: active, registered, pending_payment, installation_pending, cancelled. Customer type: unknown, home, corporate, sme. Imported payment status is a source snapshot, not an invoice balance calculation. Blank source status remains unknown. Registration date and payment due date are separate fields.

## Employees, teams and tickets

Create POPs, then teams and employees. Employee roles are descriptive demo fields; they do not implement separate user logins or role-based permissions. Issue types have a broad category and a kind (support, service_request, enquiry). Detailed issue type controls duplicate complaint matching: separate issue types are never merged merely because both have category other.

Ticket list → unlock operational fields → View/Edit. Assign team/member, creator, assigner, forwarder, resolver, source and ETR. New assignments validate employee/team compatibility. Historical assignments are preserved even if an employee has since moved teams. Reporter name/phone/role are distinct from the customer identifier. For an unlinked prospect or external ticket, explicitly enable allowUnlinked and provide a reporter name. Linked customer lookup still supports CID/phone.

Activity history records ticket changes, status changes and repeat complaints. MCP note changes also create events. Actor names are snapshotted where an employee reference is supplied; this is not proof of an authenticated individual because the demo uses a shared key. Closing a resolved ticket preserves its resolution timestamp. Reopening clears its current resolution timestamp but retains the earlier activity event.

## Invoices and payments

Create an invoice using CID/phone, optional period (YYYY-MM), due date, MRC, OTC and discount. Blank MRC uses the agreed customer charge or package total. OTC defaults to zero for each invoice; the system does not repeatedly add a connection fee. Total = MRC + OTC − discount, rounded to two decimal places.

Record a payment against an invoice: amount, method, reference, date/time and optional receiving employee. Methods are cash, bank, bkash, nagad and other. These are ledger records only; no gateway transfer or outgoing message is performed. Balance and paid/partial/unpaid state are calculated from payments. Overpayments and reducing an invoice below its payments are blocked. Invoices with payments cannot be deleted. A customer with invoices cannot be deleted; mark them inactive instead. Operations edits/deletes retain activity records.

## Import the provided report formats

1. Open Report imports and unlock it. Choose a UTF-8 CSV (up to 2 MB / 500 rows). The importer detects the report header after title/preamble rows and supports quoted multiline addresses/notes.
2. Check column mapping. Select MM/DD/YYYY for these exports, or explicitly choose DD/MM/YYYY for a different source. Unknown or invalid dates remain review errors; no date is invented.
3. For ticket reports, select whether Name/Mobile No. is a reporter, employee or confirmed customer contact. Default reporter mode never treats that phone as the customer's phone. Confirmed customer mode may resolve an account by that phone; ambiguous numbers require a CID. Employee contacts remain reporter snapshots; employees are mapped by existing directory names, not automatically invented.
4. Preview and validate. Map each source package name to an existing package if no unique exact name matches. POP/team references must exist, be mapped, or be explicitly permitted for creation. Missing packages and employees are never fabricated.
5. Save the review queue. Review rows to fix customer/reference mappings, or explicitly allow an unlinked ticket. Raw source rows remain visible read-only. Duplicate IDs within a report are flagged; skip one and revalidate the other.
6. Use Batch reference mapping options and Revalidate remaining after creating master records or changing package mappings. Imported/skipped rows are preserved.
7. Import individual ready rows or all ready rows. Rows commit independently and are revalidated. Imported rows are not imported twice. Failed/unmatched rows remain in the queue for correction.

Payment Due import creates customer registration records and retains Remarks as follow-up notes with unknown original contact time. It does not create invoices/payments, infer a payment from remarks, or turn Entry Date into a due date. Source MRC/OTC amounts are preserved, including rounding already present in the file.

Historical ticket import preserves original ticket number and original creation/resolution instants (Asia/Dhaka). It bypasses live duplicate-complaint merging, so resolved historical tickets do not become notes on current open complaints. Source customer ID/name/type, package and POP are retained even when a customer is unmatched. Work-progress notes are labelled as imported; missing original note/assignment times are not guessed. Relative Last Activity strings stay in the raw snapshot rather than being interpreted relative to today's date. Original source columns, including Day/Hour/Minute, remain available in the saved batch; elapsed resolution time is derived from timestamps.

## API and MCP

Every operation below requires a dashboard session or `Authorization: Bearer YOUR_MCP_API_KEY`:

| Method | Endpoint | Body / query |
|---|---|---|
| GET | `/api/operations?entity=employees` | Entities: pops, teams, employees, issue-types, followups, invoices, payments; optional cid filters customer records |
| POST / PUT / DELETE | `/api/operations?entity=...` | JSON fields shown in UI; PUT/DELETE require id |
| GET | `/api/operations?detail=1&entity=customers&key=CID-10021` | Customer metadata, follow-ups, invoices, payments and history |
| GET | `/api/operations?detail=1&entity=tickets&key=TKT-...` | Ticket assignment, source and history |
| GET | `/api/report-imports` | List batches |
| GET | `/api/report-imports?id=1` | Original/mapped rows, states and errors |
| POST | `/api/report-imports` | action: preview, stage, edit, revalidate or commit |

Preview/stage bodies contain kind (customers/tickets), csv, filename, mapping and options. Options include dateFormat, contactRole, createReferences and packageMap. Edit uses batchId, rowId, payload and optional skip. Revalidate uses batchId and optional options. Commit uses batchId and optional rowIds. List endpoints return at most 1000 operation records or 100 batches.

MCP now provides 31 tools. Added tools: list_operations, manage_operation, get_operational_details, preview_report_import, stage_report_import, list_report_imports, get_report_import, edit_report_import_row, revalidate_report_import and commit_report_import. Existing customer/ticket tools accept the new metadata fields; get_customer/get_ticket include protected operational details. Requests use the same service validation and transactions as the dashboard.

## Verification

With MySQL and the application running:

```powershell
$env:TEST_BASE_URL='http://localhost:3008'
npm.cmd run check:operations
```

The check creates and cleans up its own records, tests assignment/duplicate handling, payment guards and historical report import, and previews the two supplied CSVs without importing their real records. `npm.cmd run check:mcp` builds an isolated server and checks MCP discovery/authentication. Neither command sends messages or makes real payment transfers.
