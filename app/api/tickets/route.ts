import { NextRequest, NextResponse } from "next/server";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { transaction } from "@/lib/db";
import { apiError } from "@/lib/http";

const categories = ["no_internet", "slow_speed", "billing", "line_issue", "other"];
const priorities = ["low", "medium", "high", "urgent"];

export async function GET(request: NextRequest) {
  try {
    const { db } = await import("@/lib/db");
    const ticketNo = request.nextUrl.searchParams.get("ticketNo");
    if (ticketNo) {
      const [tickets] = await db.query(`
        SELECT t.id, t.ticket_no AS ticketNo, t.category, t.subject, t.description,
          t.status, t.priority, t.created_at AS createdAt,
          c.cid, c.name AS customerName
        FROM tickets t JOIN customers c ON c.id = t.customer_id
        WHERE t.ticket_no = ? LIMIT 1
      `, [ticketNo]);
      if (!Array.isArray(tickets) || !tickets.length) return NextResponse.json({ success: false, message: "Ticket not found" }, { status: 404 });
      const ticket = tickets[0] as { id: number };
      const [notes] = await db.query("SELECT id, note, created_at AS createdAt FROM ticket_notes WHERE ticket_id = ? ORDER BY created_at DESC", [ticket.id]);
      return NextResponse.json({ success: true, data: { ticket, notes } });
    }
    const [tickets] = await db.query(`
      SELECT t.ticket_no AS ticketNo, t.category, t.subject, t.description,
        t.status, t.priority, t.created_at AS createdAt, t.updated_at AS updatedAt,
        c.cid, c.name AS customerName,
        (SELECT COUNT(*) FROM ticket_notes n WHERE n.ticket_id = t.id) AS noteCount
      FROM tickets t JOIN customers c ON c.id = t.customer_id
      ORDER BY t.created_at DESC
    `);
    return NextResponse.json({ success: true, data: tickets });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const { ticketNo, status } = await request.json();
    if (!ticketNo?.trim()) return NextResponse.json({ success: false, message: "ticketNo is required" }, { status: 400 });
    if (!["open", "in_progress", "resolved", "closed"].includes(status)) return NextResponse.json({ success: false, message: "Invalid status" }, { status: 400 });
    const { db } = await import("@/lib/db");
    const [result] = await db.execute(`
      UPDATE tickets SET status = ?, resolved_at = IF(? = 'resolved', CURRENT_TIMESTAMP, NULL)
      WHERE ticket_no = ?
    `, [status, status, ticketNo.trim()]);
    if (!(result as { affectedRows: number }).affectedRows) return NextResponse.json({ success: false, message: "Ticket not found" }, { status: 404 });
    return NextResponse.json({ success: true, message: "Ticket status updated" });
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cid, category, subject, description } = body;
    const priority = body.priority ?? "medium";
    if (!cid || !category || !subject?.trim() || !description?.trim() || !categories.includes(category) || !priorities.includes(priority)) {
      return NextResponse.json({ success: false, message: "CID, category, subject and description are required" }, { status: 400 });
    }

    const result = await transaction(async connection => {
      const [customers] = await connection.query<(RowDataPacket & { id: number })[]>("SELECT id FROM customers WHERE cid = ? LIMIT 1 FOR UPDATE", [cid]);
      if (!customers.length) throw new Error("CUSTOMER_NOT_FOUND");
      const customerId = customers[0].id;
      const [existing] = await connection.query<(RowDataPacket & { id: number; ticketNo: string })[]>(`
        SELECT id, ticket_no AS ticketNo FROM tickets
        WHERE customer_id = ? AND category = ? AND status IN ('open','in_progress')
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [customerId, category]);

      if (existing.length) {
        await connection.execute("INSERT INTO ticket_notes (ticket_id, note) VALUES (?, ?)", [existing[0].id, description.trim()]);
        await connection.execute("UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [existing[0].id]);
        return { action: "note_added", ticketNo: existing[0].ticketNo, message: "Complaint added as a note to the existing unresolved ticket." };
      }

      const ticketNo = `TKT-${Date.now().toString().slice(-8)}`;
      const [insert] = await connection.execute<ResultSetHeader>(`
        INSERT INTO tickets (ticket_no, customer_id, category, subject, description, priority)
        VALUES (?, ?, ?, ?, ?, ?)`, [ticketNo, customerId, category, subject.trim(), description.trim(), priority]);
      return { action: "created", id: insert.insertId, ticketNo, message: "Ticket created successfully." };
    });
    return NextResponse.json({ success: true, data: result }, { status: result.action === "created" ? 201 : 200 });
  } catch (error) { return apiError(error); }
}
