import { NextRequest, NextResponse } from "next/server";
import { db, DbRow } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function GET(_request: NextRequest, context: { params: Promise<{ cid: string }> }) {
  try {
    const { cid } = await context.params;
    const [customers] = await db.query<DbRow[]>(`
      SELECT c.id, c.cid, c.name, c.phone, c.email, c.address,
        c.next_payment_date AS nextPaymentDate, c.account_status AS accountStatus,
        p.name AS packageName, p.speed_mbps AS speedMbps, p.price AS packagePrice
      FROM customers c JOIN packages p ON p.id = c.package_id
      WHERE c.cid = ? LIMIT 1`, [decodeURIComponent(cid)]);
    if (!customers.length) return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 });

    const [tickets] = await db.query<DbRow[]>(`
      SELECT t.id, t.ticket_no AS ticketNo, t.category, t.subject, t.description,
        t.status, t.priority, t.created_at AS createdAt, t.updated_at AS updatedAt,
        (SELECT COUNT(*) FROM ticket_notes n WHERE n.ticket_id = t.id) AS noteCount
      FROM tickets t WHERE t.customer_id = ? ORDER BY t.created_at DESC LIMIT 10`, [customers[0].id]);

    return NextResponse.json({ success: true, data: { customer: customers[0], tickets } });
  } catch (error) { return apiError(error); }
}
