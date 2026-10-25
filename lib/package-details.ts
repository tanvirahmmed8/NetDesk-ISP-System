export const packageDefaults={unlimited:true,serviceHours:24,connectionType:"fiber_optics",publicIpCount:0,otcCharge:0,supportHours:"24/7",vatPercent:0,vatIncluded:true};
export type PackageDetails=typeof packageDefaults&{id:number;name:string;speedMbps:number;price:string|number;monthlyTotal:number;vatAmount:number};
export const connectionNames:Record<string,string>={fiber_optics:"Fiber Optics",wireless:"Wireless",ethernet:"Ethernet",other:"Other"};
export function packagePricing(pkg:{price:number|string;vatPercent?:number|string;vatIncluded?:boolean|number|string}) {
  const price=Number(pkg.price),rate=Number(pkg.vatPercent??0);
  const included=pkg.vatIncluded===undefined||pkg.vatIncluded===true||pkg.vatIncluded===1||pkg.vatIncluded==="1"||pkg.vatIncluded==="true";
  const monthlyTotal=Math.round((included?price:price*(1+rate/100))*100)/100;
  const vatAmount=Math.round((included?price-price/(1+rate/100):monthlyTotal-price)*100)/100;
  return {monthlyTotal,vatAmount};
}
export function presentPackage(row:Record<string,unknown>) {
  const result={...row,unlimited:Boolean(Number(row.unlimited??1)),serviceHours:Number(row.serviceHours??24),connectionType:String(row.connectionType??"fiber_optics"),publicIpCount:Number(row.publicIpCount??0),otcCharge:Number(row.otcCharge??0),supportHours:String(row.supportHours??"24/7"),vatPercent:Number(row.vatPercent??0),vatIncluded:Boolean(Number(row.vatIncluded??1))};
  return {...result,...packagePricing({price:Number(row.price),vatPercent:result.vatPercent,vatIncluded:result.vatIncluded})};
}
// Alias parameter must be supplied by application code, never by request data.
export const packageColumns=(alias="p")=>`${alias}.unlimited,${alias}.service_hours AS serviceHours,${alias}.connection_type AS connectionType,${alias}.public_ip_count AS publicIpCount,${alias}.otc_charge AS otcCharge,${alias}.support_hours AS supportHours,${alias}.vat_percent AS vatPercent,${alias}.vat_included AS vatIncluded`;
export const monthlyPriceSql=(alias="p")=>`ROUND(CASE WHEN ${alias}.vat_included=1 THEN ${alias}.price ELSE ${alias}.price*(1+${alias}.vat_percent/100) END,2)`;
