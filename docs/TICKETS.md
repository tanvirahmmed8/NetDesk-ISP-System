# Ticket details, notes and numbering

In Ticket list, click the blue numeric ticket ID to open the details panel. Customer profiles also have clickable recent-ticket IDs. The panel shows the customer/CID, complaint description, status/priority, timestamps and a separate notes timeline. Use Add note, Edit or Delete to manage notes. Deletion requires confirmation; activity history remains. Description and notes are separate, so a converted payment follow-up may display 0 notes while all original text remains in its description.

The existing View / Edit control still edits the ticket's complaint/details. Adding notes does not replace description, resolve a ticket, or change its original resolution timestamp. Notes can be added to resolved/closed tickets without reopening them. The panel refreshes its notes and list note count after changes.

## Numbers

The list displays the stable numeric database ticket ID (`#123`), not the old long UUID reference. This is the display ID, not a renamed legacy API reference. Search accepts both the numeric display ID and the original reference. The API reference remains visible in the details panel; API clients/MCP still use ticketNo.

New tickets created manually, through basic bulk upload, REST or MCP receive ticketNo=`TKT-{database id}` (for example database id 329 -> TKT-329). The shared creation service uses MySQL's auto-increment ID, never MAX(id)+1 or a random public number. An internal temporary reference is replaced inside the same transaction before commit. If a historical record already owns the candidate reference, only the uncommitted placeholder is discarded and a new database ID is tried; existing records are never overwritten. Number gaps after retries/deletes/rollbacks are normal. Existing UUID-style, numeric and historical references are not rewritten during normal edits; historical Report imports still retain their source ticket number. No migration, data deletion or CSV re-upload is needed for this generation rule.

## Notes REST API

Every method requires a dashboard session or MCP bearer key. Cookie writes require same-origin protection. Under `/api/tickets/{ticketNo}/notes`:

- GET: returns note records with id, note, createdAt.
- POST `{ "note": "Called customer; checking the line." }`: adds a note (201).
- PUT `{ "id": 1, "note": "Updated note" }`: edits a note on this ticket.
- DELETE `{ "id": 1 }`: deletes a note on this ticket.

Notes must contain 1–10,000 characters. A note from another ticket cannot be edited/deleted through this ticket. The existing MCP create_ticket_note/update_ticket_note/delete_ticket_note tools use the same transaction/audit service. Dashboard note activity snapshots the signed-in account name, not an unverified client-supplied actor. Shared-key API/MCP requests do not prove the identity of an individual employee.

## Verification

With a test application running (default port 3018), run `npm run check:ticket-notes`. It creates/cleans its own records and checks numbering, detail fields, multi-note CRUD, wrong-ticket protection, validation, CSRF/session auth and legacy-reference compatibility. No production customer tickets need to be renamed or re-uploaded.
