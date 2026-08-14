import { NextRequest, NextResponse } from "next/server";
import { ResultSetHeader } from "mysql2";
import { db } from "@/lib/db";
import { apiError } from "@/lib/http";

const statuses = ["active", "suspended", "inactive"];

export async function GET() {
  try {
    const [customers] = await db.query(`
      SELECT c.cid, c.name, c.phone, c.email, c.address,
        c.next_payment_date AS nextPaymentDate, c.account_status AS accountStatus,
        p.name AS packageName, p.speed_mbps AS speedMbps, p.price AS packagePrice,
        (SELECT COUNT(*) FROM tickets t WHERE t.customer_id = c.id AND t.status IN ('open','in_progress')) AS openTickets
      FROM customers c JOIN packages p ON p.id = c.package_id
      ORDER BY c.created_at DESC
    `);
    return NextResponse.json({ success: true, data: customers });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cid, name, phone, email, address, packageId, nextPaymentDate } = body;
    const accountStatus = body.accountStatus ?? "active";

    if (!cid?.trim() || !name?.trim() || !phone?.trim() || !packageId || !nextPaymentDate || !statuses.includes(accountStatus)) {
      return NextResponse.json({ success: false, message: "CID, name, phone, package and payment date are required" }, { status: 400 });
    }

    const [existing] = await db.query("SELECT id FROM customers WHERE cid = ? LIMIT 1", [cid.trim()]);
    if (Array.isArray(existing) && existing.length) {
      return NextResponse.json({ success: false, message: "This CID is already in use" }, { status: 409 });
    }

    const [result] = await db.execute<ResultSetHeader>(`
      INSERT INTO customers
        (cid, name, phone, email, address, package_id, next_payment_date, account_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [cid.trim(), name.trim(), phone.trim(), email?.trim() || null, address?.trim() || null, Number(packageId), nextPaymentDate, accountStatus]);

    return NextResponse.json({
      success: true,
      message: "Customer created successfully",
      data: { id: result.insertId, cid: cid.trim() },
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
