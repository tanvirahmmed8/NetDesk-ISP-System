import { NextRequest, NextResponse } from "next/server";
import { ResultSetHeader } from "mysql2";
import { db } from "@/lib/db";
import { apiError } from "@/lib/http";

const statuses = ["open", "in_progress", "resolved", "closed"];

export async function PATCH(request: NextRequest, context: { params: Promise<{ ticketNo: string }> }) {
  try {
    const { status } = await request.json();
    if (!statuses.includes(status)) return NextResponse.json({ success: false, message: "Invalid status" }, { status: 400 });
    const { ticketNo } = await context.params;
    const [result] = await db.execute<ResultSetHeader>(`
      UPDATE tickets SET status = ?, resolved_at = IF(? = 'resolved', CURRENT_TIMESTAMP, NULL)
      WHERE ticket_no = ?`, [status, status, decodeURIComponent(ticketNo)]);
    if (!result.affectedRows) return NextResponse.json({ success: false, message: "Ticket not found" }, { status: 404 });
    return NextResponse.json({ success: true, message: "Ticket status updated" });
  } catch (error) { return apiError(error); }
}
