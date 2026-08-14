import { NextRequest, NextResponse } from "next/server";
import { db, DbRow } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function GET(_request: NextRequest, context: { params: Promise<{ ticketNo: string }> }) {
  try {
    const { ticketNo } = await context.params;
    const [tickets] = await db.query<DbRow[]>(`
      SELECT t.ticket_no AS ticketNo, t.category, t.subject, t.description, t.status,
        t.priority, t.created_at AS createdAt, c.cid, c.name AS customerName
      FROM tickets t JOIN customers c ON c.id=t.customer_id WHERE t.ticket_no=? LIMIT 1`, [decodeURIComponent(ticketNo)]);
    if (!tickets.length) return NextResponse.json({ success: false, message: "Ticket not found" }, { status: 404 });
    const [notes] = await db.query<DbRow[]>("SELECT id, note, created_at AS createdAt FROM ticket_notes WHERE ticket_id=(SELECT id FROM tickets WHERE ticket_no=?) ORDER BY created_at DESC", [ticketNo]);
    return NextResponse.json({ success: true, data: { ticket: tickets[0], notes } });
  } catch (error) { return apiError(error); }
}
