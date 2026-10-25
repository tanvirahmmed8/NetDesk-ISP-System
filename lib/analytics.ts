import { RowDataPacket } from "mysql2";
import { db } from "./db";
import { monthlyPriceSql } from "./package-details";

export function dateSeries(today:string,days:number) {
  return Array.from({length:days},(_,index)=>{const date=new Date(`${today}T00:00:00Z`);date.setUTCDate(date.getUTCDate()-days+1+index);return date.toISOString().slice(0,10);});
}

export async function dashboardAnalytics(days:number) {
  const connection=await db.getConnection();
  let timezone:string|undefined;
  try {
    const [zone]=await connection.query<RowDataPacket[]>("SELECT @@session.time_zone AS zone");timezone=zone[0].zone;
    await connection.query("SET time_zone = '+06:00'");
    await connection.beginTransaction();
    const [clock]=await connection.query<RowDataPacket[]>("SELECT DATE_FORMAT(CURDATE(),'%Y-%m-%d') AS today");
    const today=String(clock[0].today),dates=dateSeries(today,days),start=dates[0];
    const previous=dateSeries(start,days+1)[0];
    const [customers]=await connection.query<RowDataPacket[]>(`
      SELECT COUNT(*) AS total,COALESCE(SUM(c.account_status='active'),0) AS active,
        COALESCE(SUM(c.account_status='suspended'),0) AS suspended,COALESCE(SUM(c.account_status='inactive'),0) AS inactive,
        COALESCE(SUM(CASE WHEN c.account_status='active' THEN COALESCE(c.agreed_mrc,${monthlyPriceSql()}) ELSE 0 END),0) AS monthlyValue,
        COALESCE(SUM(c.next_payment_date<CURDATE()),0) AS overdue,
        COALESCE(SUM(c.next_payment_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 7 DAY)),0) AS dueSoon,
        COALESCE(SUM(c.created_at>=? AND c.created_at<DATE_ADD(CURDATE(),INTERVAL 1 DAY)),0) AS newCustomers,
        COALESCE(SUM(c.created_at>=? AND c.created_at<?),0) AS previousCustomers
      FROM customers c JOIN packages p ON p.id=c.package_id`,[start,previous,start]);
    const [tickets]=await connection.query<RowDataPacket[]>(`
      SELECT COUNT(*) AS total,COALESCE(SUM(status IN ('open','in_progress')),0) AS unresolved,
        COALESCE(SUM(status='open'),0) AS open,COALESCE(SUM(status='in_progress'),0) AS inProgress,
        COALESCE(SUM(status='resolved'),0) AS resolved,COALESCE(SUM(status='closed'),0) AS closed,
        COALESCE(SUM(priority IN ('high','urgent') AND status IN ('open','in_progress')),0) AS urgent,
        COALESCE(SUM(created_at>=? AND created_at<DATE_ADD(CURDATE(),INTERVAL 1 DAY)),0) AS newTickets,
        COALESCE(SUM(resolved_at>=? AND resolved_at<DATE_ADD(CURDATE(),INTERVAL 1 DAY)),0) AS resolvedInPeriod,
        AVG(CASE WHEN resolved_at>=? AND resolved_at<DATE_ADD(CURDATE(),INTERVAL 1 DAY) AND resolved_at>=created_at THEN TIMESTAMPDIFF(MINUTE,created_at,resolved_at)/60 END) AS averageResolutionHours
      FROM tickets`,[start,start,start]);
    const [customerTrend]=await connection.query<RowDataPacket[]>("SELECT DATE_FORMAT(created_at,'%Y-%m-%d') AS day,COUNT(*) AS count FROM customers WHERE created_at>=? AND created_at<DATE_ADD(CURDATE(),INTERVAL 1 DAY) GROUP BY day",[start]);
    const [ticketTrend]=await connection.query<RowDataPacket[]>("SELECT DATE_FORMAT(created_at,'%Y-%m-%d') AS day,COUNT(*) AS count FROM tickets WHERE created_at>=? AND created_at<DATE_ADD(CURDATE(),INTERVAL 1 DAY) GROUP BY day",[start]);
    const [packages]=await connection.query<RowDataPacket[]>(`SELECT p.id,p.name,p.speed_mbps AS speedMbps,p.price,${monthlyPriceSql()} AS monthlyTotal,COUNT(c.id) AS subscribers,COALESCE(SUM(CASE WHEN c.account_status='active' THEN COALESCE(c.agreed_mrc,${monthlyPriceSql()}) ELSE 0 END),0) AS monthlyValue FROM packages p LEFT JOIN customers c ON c.package_id=p.id GROUP BY p.id,p.name,p.speed_mbps,p.price,p.vat_percent,p.vat_included ORDER BY subscribers DESC,p.id LIMIT 8`);
    const [dueCustomers]=await connection.query<RowDataPacket[]>(`SELECT c.cid,c.name,c.phone,c.next_payment_date AS nextPaymentDate,c.account_status AS accountStatus,COALESCE(c.agreed_mrc,${monthlyPriceSql()}) AS price,p.name AS packageName,DATEDIFF(c.next_payment_date,CURDATE()) AS daysUntil FROM customers c JOIN packages p ON p.id=c.package_id WHERE c.next_payment_date<=DATE_ADD(CURDATE(),INTERVAL 7 DAY) ORDER BY c.next_payment_date,c.id LIMIT 6`);
    const [recentTickets]=await connection.query<RowDataPacket[]>("SELECT t.ticket_no AS ticketNo,t.subject,t.status,t.priority,t.created_at AS createdAt,c.cid,COALESCE(c.name,'Unlinked customer') AS customerName FROM tickets t LEFT JOIN customers c ON c.id=t.customer_id ORDER BY t.created_at DESC,t.id DESC LIMIT 5");
    await connection.commit();
    const numeric=(row:RowDataPacket)=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value===null?null:Number(value)]));
    const customerCounts=new Map(customerTrend.map(row=>[String(row.day),Number(row.count)]));
    const ticketCounts=new Map(ticketTrend.map(row=>[String(row.day),Number(row.count)]));
    return {days,startDate:start,endDate:today,timezone:"Asia/Dhaka",generatedAt:new Date().toISOString(),customers:numeric(customers[0]),tickets:numeric(tickets[0]),trend:dates.map(day=>({day,customers:customerCounts.get(day)||0,tickets:ticketCounts.get(day)||0})),packages:packages.map(row=>({...row,subscribers:Number(row.subscribers),price:Number(row.price),monthlyValue:Number(row.monthlyValue)})),dueCustomers,recentTickets};
  }catch(error){await connection.rollback();throw error;}
  finally{try{if(timezone!==undefined)await connection.query("SET time_zone = ?",[timezone]);}finally{connection.release();}}
}
