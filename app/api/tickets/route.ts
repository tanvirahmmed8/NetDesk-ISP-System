import { NextRequest, NextResponse } from "next/server";
import { InputError } from "@/lib/manage";
import { apiError } from "@/lib/http";
import { setTicketStatus } from "@/lib/operations";
import { POST as create, PUT as update, DELETE as remove } from "../manage/[entity]/route";

const context = {params:Promise.resolve({entity:"tickets"})};
export async function PUT(request:NextRequest) {return update(request,context);}
export async function DELETE(request:NextRequest) {return remove(request,context);}


export async function GET(request: NextRequest) {
  try {
    const { db } = await import("@/lib/db");
    const ticketNo = request.nextUrl.searchParams.get("ticketNo");
    if (ticketNo) {
      const [tickets] = await db.query(`
        SELECT t.id, t.ticket_no AS ticketNo, t.category, t.subject, t.description,
          t.status, t.priority, t.created_at AS createdAt,t.updated_at AS updatedAt,t.resolved_at AS resolvedAt,
          c.cid, c.phone, COALESCE(c.name,'Unlinked customer') AS customerName
        FROM tickets t LEFT JOIN customers c ON c.id = t.customer_id
        WHERE t.ticket_no = ? LIMIT 1
      `, [ticketNo]);
      if (!Array.isArray(tickets) || !tickets.length) return NextResponse.json({ success: false, message: "Ticket not found" }, { status: 404 });
      const ticket = tickets[0] as { id: number };
      const [notes] = await db.query("SELECT id, note, created_at AS createdAt FROM ticket_notes WHERE ticket_id = ? ORDER BY created_at DESC", [ticket.id]);
      return NextResponse.json({ success: true, data: { ticket, notes } });
    }
    const [tickets] = await db.query(`
      SELECT t.id,t.ticket_no AS ticketNo, t.category, t.subject, t.description,
        t.status, t.priority, t.created_at AS createdAt, t.updated_at AS updatedAt,
        c.cid, c.phone, COALESCE(c.name,'Unlinked customer') AS customerName,
        (SELECT COUNT(*) FROM ticket_notes n WHERE n.ticket_id = t.id) AS noteCount
      FROM tickets t LEFT JOIN customers c ON c.id = t.customer_id
      ORDER BY t.created_at DESC
    `);
    return NextResponse.json({ success: true, data: tickets });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    let body; try { body = await request.json(); } catch { throw new InputError("Invalid JSON"); }
    const data = await setTicketStatus(body?.ticketNo, body?.status);
    return NextResponse.json({success:true,message:"Ticket status updated",data});
  } catch(error) { return apiError(error); }
}
export async function POST(request:NextRequest) {return create(request,context);}
