"use client";
import { Check, Plus, Wifi } from "lucide-react";
import { connectionNames, PackageDetails, packagePricing } from "@/lib/package-details";
const money=(n:number|string)=>`৳${Number(n).toLocaleString("en-BD",{maximumFractionDigits:2})}`;
export default function PackageCatalog({packages,customers,onChoose}:{packages:PackageDetails[];customers:{packageId?:number}[];onChoose:(id:number)=>void}) {
  return <div className="plan-catalog">{packages.map(pkg=>{
    const pricing=packagePricing(pkg);
    const features=[`${pkg.serviceHours} hours ${pkg.unlimited?"unlimited":"internet access"}`,connectionNames[pkg.connectionType]||pkg.connectionType,...(pkg.publicIpCount>0?[`${pkg.publicIpCount} Public IP${pkg.publicIpCount>1?"s":""}`]:[]),pkg.otcCharge===0?"OTC free":`OTC ${money(pkg.otcCharge)} (one-time)`,`${pkg.supportHours} customer care`];
    return <article className="plan-card" key={pkg.id}><div className="plan-card-head"><span>PKG-{String(pkg.id).padStart(3,"0")}</span><h2>{pkg.name}</h2><i><Wifi size={25}/></i></div><div className="plan-card-body"><div className="plan-bandwidth"><strong>{pkg.speedMbps}</strong><span>Mbps</span></div><ul>{features.map(feature=><li key={feature}><Check size={14}/>{feature}</li>)}</ul><div className="plan-pricing"><strong>{money(pkg.price)}</strong><small>{pkg.vatPercent>0?pkg.vatIncluded?`${pkg.vatPercent}% VAT included / month`:`+${pkg.vatPercent}% VAT / month`:"per month · No added VAT"}</small>{!pkg.vatIncluded&&pkg.vatPercent>0&&<span>Monthly total: <b>{money(pricing.monthlyTotal)}</b></span>}</div><button onClick={()=>onChoose(pkg.id)}><Plus size={15}/> Add customer with this plan</button><p>{customers.filter(customer=>Number(customer.packageId)===pkg.id).length} customers subscribed</p></div></article>;
  })}</div>;
}
