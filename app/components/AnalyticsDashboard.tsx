"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, CalendarDays, CircleDollarSign, Clock3, RefreshCw, Ticket, Users, Wifi } from "lucide-react";

type DashboardData={days:number;startDate:string;endDate:string;timezone:string;generatedAt:string;customers:Record<string,number|null>;tickets:Record<string,number|null>;trend:{day:string;customers:number;tickets:number}[];packages:{id:number;name:string;speedMbps:number;price:number;monthlyTotal?:number;subscribers:number;monthlyValue:number}[];dueCustomers:{cid:string;name:string;nextPaymentDate:string;packageName:string;price:string;daysUntil:number}[];recentTickets:{ticketNo:string;subject:string;status:string;priority:string;createdAt:string;cid:string|null;customerName:string}[]};
const count=(value:number|null|undefined)=>Number(value||0).toLocaleString("en-BD");
const money=(value:number|null|undefined)=>`৳${Number(value||0).toLocaleString("en-BD",{maximumFractionDigits:2})}`;
const dayLabel=(day:string)=>new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",timeZone:"Asia/Dhaka"}).format(new Date(`${day.slice(0,10)}T00:00:00+06:00`));
const statusName=(value:string)=>value.replaceAll("_"," ");

export default function AnalyticsDashboard({onCustomers,onTickets,onPackages,onNewCustomer,onCustomer}:{onCustomers:()=>void;onTickets:()=>void;onPackages:()=>void;onNewCustomer:()=>void;onCustomer:(cid:string)=>void}) {
  const [days,setDays]=useState(30);
  const [data,setData]=useState<DashboardData|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const controller=useRef<AbortController|null>(null);
  const refresh=useCallback(async()=>{
    controller.current?.abort();const request=new AbortController();controller.current=request;
    setLoading(true);
    try{
      const response=await fetch(`/api/analytics?days=${days}`,{cache:"no-store",signal:request.signal});
      const json=await response.json();if(!response.ok)throw new Error(json.message||"Unable to load analytics");
      if(!request.signal.aborted){setData(json.data);setError("");}
    }catch(e){if(!request.signal.aborted)setError(e instanceof Error?e.message:"Unable to load analytics");}
    finally{if(!request.signal.aborted)setLoading(false);}
  },[days]);
  useEffect(()=>{
    void refresh();
    const interval=setInterval(()=>{if(!document.hidden)void refresh();},30000);
    const focus=()=>{if(!document.hidden)void refresh();};
    window.addEventListener("focus",focus);
    return()=>{clearInterval(interval);window.removeEventListener("focus",focus);controller.current?.abort();};
  },[refresh]);
  const c=data?.customers??{},t=data?.tickets??{};
  const activeRate=c.total?Math.round((c.active||0)/c.total*100):0;
  const totalAccounts=c.total||0;
  const resolutionRate=t.total?Math.round(((t.resolved||0)+(t.closed||0))/t.total*100):0;
  const percentage=(n:number)=>totalAccounts?n/totalAccounts*100:0;
  return <section className="analytics-page" aria-busy={loading}>
    <div className="ana-heading"><div><p className="eyebrow">YOUR NETWORK, AT A GLANCE</p><h1>Operations overview<span>.</span></h1><p>A clear view of your customers, service and support.</p></div><div className="ana-controls"><label><CalendarDays size={15}/><span className="sr-only">Analytics period</span><select value={days} onChange={e=>setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label><button disabled={loading} onClick={()=>void refresh()} aria-label="Refresh analytics"><RefreshCw size={17} className={loading?"ana-spinning":""}/></button></div></div>
    <div className="ana-live"><span className={error?"ana-live-error":""}/>{error?"Connection needs attention":data?"Live database insights":"Connecting to database…"}<small>{data?`Updated ${new Date(data.generatedAt).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Dhaka"})} · Asia/Dhaka · refreshes every 30s`:"All amounts in BDT"}</small></div>
    {error&&<div className="ana-error" role="alert"><div><b>Could not refresh dashboard</b><p>{error}{data?" Last successfully loaded figures are shown below.":""}</p></div><button disabled={loading} onClick={()=>void refresh()}>Retry</button></div>}
    {!data&&!error&&<div className="ana-skeleton" role="status" aria-label="Loading dashboard">{Array.from({length:4},(_,i)=><div key={i}/>)}<div className="ana-skeleton-chart"/></div>}
    {data&&<>
      <div className="ana-metrics">
        <button className="ana-metric" onClick={onCustomers}><div className="ana-metric-top"><span>Total customers</span><i className="ana-blue"><Users size={18}/></i></div><strong>{count(c.total)}</strong><div><span className="ana-badge">{activeRate}% active</span><small>{count(c.active)} active connections</small></div><ArrowUpRight className="ana-card-arrow" size={16}/></button>
        <button className="ana-metric" onClick={onPackages}><div className="ana-metric-top"><span>Monthly package value</span><i className="ana-teal"><CircleDollarSign size={18}/></i></div><strong>{money(c.monthlyValue)}</strong><div><small>Estimated from active subscriptions</small></div><ArrowUpRight className="ana-card-arrow" size={16}/></button>
        <button className="ana-metric" onClick={onTickets}><div className="ana-metric-top"><span>Unresolved tickets</span><i className="ana-violet"><Ticket size={18}/></i></div><strong>{count(t.unresolved)}</strong><div><span className={`ana-badge ${(t.urgent||0)>0?"ana-warn":""}`}>{count(t.urgent)} high / urgent</span><small>Requires attention</small></div><ArrowUpRight className="ana-card-arrow" size={16}/></button>
        <button className="ana-metric" onClick={onCustomers}><div className="ana-metric-top"><span>Payments due soon</span><i className="ana-amber"><CalendarDays size={18}/></i></div><strong>{count(c.dueSoon)}</strong><div><span className={`ana-badge ${(c.overdue||0)>0?"ana-warn":""}`}>{count(c.overdue)} overdue dates</span><small>Today through next 7 days</small></div><ArrowUpRight className="ana-card-arrow" size={16}/></button>
      </div>
      <div className="ana-chart-grid">
        <article className="ana-panel ana-growth"><div className="ana-panel-heading"><div><h2>Customer & support activity</h2><p>New records · {dayLabel(data.startDate)} – {dayLabel(data.endDate)}</p></div><div className="ana-chart-legend"><span><i/>Customers</span><span><i/>Tickets</span></div></div>
          <div className="ana-growth-summary"><div><b>{count(c.newCustomers)}</b><span>New customers</span></div><div><b>{count(t.newTickets)}</b><span>New tickets</span></div><p>{(c.newCustomers||0)>=(c.previousCustomers||0)?<ArrowUpRight size={16}/>:<ArrowDownLeft size={16}/>} {count(c.previousCustomers)} customers in previous {data.days} days</p></div>
          <ActivityChart trend={data.trend}/>
          <details className="ana-chart-data"><summary>View daily figures</summary><div className="table-wrap"><table><thead><tr><th>Date</th><th>New customers</th><th>New tickets</th></tr></thead><tbody>{data.trend.map(point=><tr key={point.day}><td>{dayLabel(point.day)}</td><td>{point.customers}</td><td>{point.tickets}</td></tr>)}</tbody></table></div></details>
        </article>
        <article className="ana-panel"><div className="ana-panel-heading"><div><h2>Account health</h2><p>Current customer status</p></div><Wifi size={19}/></div><div className="ana-donut-wrap"><div className="ana-donut" role="img" aria-label={`${count(c.active)} active, ${count(c.suspended)} suspended, ${count(c.inactive)} inactive`} style={{background:totalAccounts?`conic-gradient(#1976df 0 ${percentage(c.active||0)}%,#f2ae4b ${percentage(c.active||0)}% ${percentage((c.active||0)+(c.suspended||0))}%,#dfe6ef 0)`:'#e8edf4'}}><div><strong>{count(totalAccounts)}</strong><span>Total accounts</span></div></div></div><div className="ana-account-legend">{[["Active",c.active,"#1976df"],["Suspended",c.suspended,"#f2ae4b"],["Inactive",c.inactive,"#dfe6ef"]].map(([name,value,color])=><div key={String(name)}><i style={{background:String(color)}}/><span>{name}</span><b>{count(Number(value))}</b><small>{Math.round(percentage(Number(value)||0))}%</small></div>)}</div></article>
      </div>
      <div className="ana-middle-grid">
        <article className="ana-panel"><div className="ana-panel-heading"><div><h2>Popular packages</h2><p>Top 8 plans by subscriber count</p></div><button className="ana-text-link" onClick={onPackages}>All packages <ArrowRight size={14}/></button></div><div className="ana-package-list">{data.packages.length?data.packages.map((pkg,index)=><div className="ana-package-row" key={pkg.id}><span className={`ana-package-icon ana-color-${index%3}`}><Wifi size={17}/></span><div className="ana-package-info"><div><b>{pkg.name}</b><span>{pkg.subscribers} customers</span></div><div className="ana-progress"><i style={{width:`${totalAccounts?pkg.subscribers/totalAccounts*100:0}%`}}/></div><small>{pkg.speedMbps} Mbps · {money(pkg.monthlyTotal??pkg.price)}/month</small></div></div>):<p className="ana-empty">Create a package to see its subscribers here.</p>}</div></article>
        <article className="ana-panel ana-support"><div className="ana-panel-heading"><div><h2>Support performance</h2><p>Current status and selected-period resolutions</p></div><Clock3 size={19}/></div><div className="ana-support-total"><strong>{resolutionRate}%</strong><span>Currently resolved or closed</span><small>{count((t.resolved||0)+(t.closed||0))} of {count(t.total)} tickets</small></div><div className="ana-status-bar" role="img" aria-label={`Open ${count(t.open)}, in progress ${count(t.inProgress)}, resolved ${count(t.resolved)}, closed ${count(t.closed)}`}>{[["open",t.open],["progress",t.inProgress],["resolved",t.resolved],["closed",t.closed]].map(([status,value])=><i key={String(status)} className={`ana-status-${status}`} style={{width:`${t.total?Number(value)/t.total*100:0}%`}}/>)}</div><div className="ana-status-labels">{[["Open",t.open],["In progress",t.inProgress],["Resolved",t.resolved],["Closed",t.closed]].map(([name,value])=><span key={String(name)}>{name}<b>{count(Number(value))}</b></span>)}</div><div className="ana-resolution"><span>{count(t.resolvedInPeriod)} resolved in {data.days} days</span><b>{t.averageResolutionHours===null?"No resolution data":`${Number(t.averageResolutionHours||0).toFixed(1)}h avg. resolution`}</b></div></article>
      </div>
      <div className="ana-bottom-grid">
        <article className="ana-panel"><div className="ana-panel-heading"><div><h2>Recent tickets</h2><p>Latest customer complaints</p></div><button className="ana-text-link" onClick={onTickets}>View all <ArrowRight size={14}/></button></div><div className="ana-recent-list">{data.recentTickets.length?data.recentTickets.map(ticket=><button className="ana-recent-ticket" key={ticket.ticketNo} onClick={()=>ticket.cid?onCustomer(ticket.cid):onTickets()}><span className="ana-ticket-icon"><Ticket size={17}/></span><span><b>{ticket.subject}</b><small>{ticket.customerName} · {ticket.cid}</small></span><span className={`status ${ticket.status}`}>{statusName(ticket.status)}</span></button>):<p className="ana-empty">No tickets yet. New complaints will appear here.</p>}</div></article>
        <article className="ana-panel"><div className="ana-panel-heading"><div><h2>Payment schedule</h2><p>Oldest due dates and upcoming 7 days</p></div><button className="ana-text-link" onClick={onCustomers}>Customers <ArrowRight size={14}/></button></div><div className="ana-due-list">{data.dueCustomers.length?data.dueCustomers.map(customer=><button key={customer.cid} onClick={()=>onCustomer(customer.cid)}><span className="ana-person">{customer.name.slice(0,1)}</span><span><b>{customer.name}</b><small>{customer.packageName} · {dayLabel(customer.nextPaymentDate)}</small></span><span><b>{money(Number(customer.price))}</b><small className={Number(customer.daysUntil)<0?"ana-overdue":""}>{Number(customer.daysUntil)<0?`${Math.abs(Number(customer.daysUntil))} days past due`:Number(customer.daysUntil)===0?"Due today":`In ${customer.daysUntil} days`}</small></span></button>):<p className="ana-empty">No overdue or upcoming payment dates.</p>}</div></article>
      </div>
      <div className="ana-footer"><span>Package values are estimates, not recorded payments. Charts use Asia/Dhaka dates.</span><button onClick={onNewCustomer}>Add a customer <ArrowUpRight size={14}/></button></div>
    </>}
  </section>;
}

function ActivityChart({trend}:{trend:DashboardData["trend"]}) {
  const max=Math.max(1,...trend.flatMap(point=>[point.customers,point.tickets]));
  const ceiling=Math.max(4,Math.ceil(max/4)*4);
  const x=(index:number)=>42+index/Math.max(1,trend.length-1)*600;
  const y=(value:number)=>175-value/ceiling*145;
  const points=(key:"customers"|"tickets")=>trend.map((point,index)=>`${x(index)},${y(point[key])}`).join(" ");
  const ticks=[0,Math.floor((trend.length-1)/3),Math.floor((trend.length-1)*2/3),trend.length-1];
  return <div className="ana-chart"><svg viewBox="0 0 680 215" role="img" aria-label="Daily new customers and tickets for the selected period"><defs><linearGradient id="ana-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#2881e6" stopOpacity=".16"/><stop offset="100%" stopColor="#2881e6" stopOpacity="0"/></linearGradient></defs>{[0,1,2,3,4].map(index=><g key={index}><line x1={42} x2={642} y1={y(ceiling*index/4)} y2={y(ceiling*index/4)} stroke="#e9eef5" strokeDasharray="4 5"/><text x={26} y={y(ceiling*index/4)+4} textAnchor="end" fill="#94a3b5" fontSize={10}>{ceiling*index/4}</text></g>)}<polygon points={`42,175 ${points("customers")} 642,175`} fill="url(#ana-area)"/><polyline points={points("customers")} fill="none" stroke="#2379df" strokeWidth={2.5} strokeLinejoin="round"/><polyline points={points("tickets")} fill="none" stroke="#19ad9c" strokeWidth={2.5} strokeLinejoin="round"/>{trend.map((point,index)=><g key={point.day}><circle cx={x(index)} cy={y(point.customers)} r={3} fill="#2379df"><title>{dayLabel(point.day)}: {point.customers} customers</title></circle><circle cx={x(index)} cy={y(point.tickets)} r={3} fill="#19ad9c"><title>{dayLabel(point.day)}: {point.tickets} tickets</title></circle></g>)}{ticks.map(index=><text key={index} x={x(index)} y={201} textAnchor="middle" fill="#8494a7" fontSize={10}>{dayLabel(trend[index].day)}</text>)}</svg>{!trend.some(point=>point.customers||point.tickets)&&<p className="ana-chart-empty">No new activity in this period</p>}</div>;
}
