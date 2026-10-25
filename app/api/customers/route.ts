import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/http";
import { getCustomer } from "@/lib/queries";
import { packageColumns, monthlyPriceSql } from "@/lib/package-details";
import { POST as create, PUT as update, DELETE as remove } from "../manage/[entity]/route";

const context = {params:Promise.resolve({entity:"customers"})};
export async function PUT(request:NextRequest) {return update(request,context);}
export async function DELETE(request:NextRequest) {return remove(request,context);}

export async function GET(request: NextRequest) {
  try {
    const params=request.nextUrl.searchParams;
    if (["cid","phone","search"].some(key=>params.has(key))) {
      const lookup=Object.fromEntries(["cid","phone","search"].filter(key=>params.has(key)).map(key=>[key,params.get(key)!]));
      return NextResponse.json({success:true,data:await getCustomer(lookup)});
    }
    const [customers] = await db.query(`
      SELECT c.cid, c.name, c.phone, c.email, c.address, c.package_id AS packageId,
        c.next_payment_date AS nextPaymentDate, c.account_status AS accountStatus,
        p.name AS packageName, p.speed_mbps AS speedMbps, p.price AS packagePrice,${packageColumns()},COALESCE(c.agreed_mrc,${monthlyPriceSql()}) AS packageMonthlyTotal,
        (SELECT COUNT(*) FROM tickets t WHERE t.customer_id = c.id AND t.status IN ('open','in_progress')) AS openTickets
      FROM customers c JOIN packages p ON p.id = c.package_id
      ORDER BY c.created_at DESC
    `);
    return NextResponse.json({ success: true, data: customers });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request:NextRequest) {return create(request,context);}
