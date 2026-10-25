"use client";

import { FormEvent, useEffect, useState } from "react";
import DataManager from "./components/DataManager";
import McpDocs from "./components/McpDocs";
import McpSettings from "./components/McpSettings";
import AnalyticsDashboard from "./components/AnalyticsDashboard";
import PackageCatalog from "./components/PackageCatalog";
import OperationsWorkspace from "./components/OperationsWorkspace";
import ReportImports from "./components/ReportImports";
import { PackageDetails, connectionNames } from "@/lib/package-details";
import { customerMatchesSearch } from "@/lib/phone";
import { Activity, BookOpen, CalendarDays, ChevronRight, CircleDollarSign, Code2, ExternalLink, Gauge, Headphones, LayoutDashboard, MapPin, Package, Phone, Plus, Search, Send, Ticket as TicketIcon, UserRound, Users, Wifi, X } from "lucide-react";

type Ticket = { ticketNo: string; category: string; subject: string; description: string; status: string; priority: string; createdAt: string; noteCount: number; cid?: string; phone?:string; customerName?: string };
type Customer = { cid: string; name: string; phone: string; email?: string; address: string; nextPaymentDate: string|null; accountStatus: string; packageName: string; speedMbps: number; packagePrice: string; openTickets?: number; packageId?:number; packageMonthlyTotal?:number|string; unlimited?:boolean|number; serviceHours?:number; connectionType?:string; publicIpCount?:number; otcCharge?:number|string; supportHours?:string; vatPercent?:number|string; vatIncluded?:boolean|number };
type InternetPackage = PackageDetails;

const categoryNames: Record<string, string> = { no_internet: "No internet", slow_speed: "Slow speed", billing: "Billing", line_issue: "Line issue", other: "Other" };
const pretty = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
const date = (value: string|null) => value ? new Intl.DateTimeFormat("en-BD", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "Not set";

export default function Home() {
  const [opsKey,setOpsKey]=useState("");
  const [cid, setCid] = useState("CID-10021");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [packages, setPackages] = useState<InternetPackage[]>([]);
  const [view, setView] = useState<"dashboard" | "customers" | "tickets" | "packages" | "details" | "developer" | "mcp" | "settings" | "operations" | "imports">("dashboard");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [customerSearch,setCustomerSearch]=useState("");
  const [ticketSearch,setTicketSearch]=useState("");
  const [form, setForm] = useState({ category: "no_internet", priority: "medium", subject: "", description: "" });
  const [customerForm, setCustomerForm] = useState({ cid: "", name: "", phone: "", email: "", address: "", packageId: "", nextPaymentDate: "", accountStatus: "active" });

  useEffect(() => {
    fetch("/api/packages").then(response => response.json()).then(json => {
      if (json.success) {
        setPackages(json.data);
        if (json.data[0]) setCustomerForm(current => ({ ...current, packageId: String(json.data[0].id) }));
      }
    }).catch(() => setMessage("Unable to load internet packages"));
    void loadCustomers();
    void loadTickets();
  }, []);

  useEffect(() => {
    const syncHash = () => {
      const route = window.location.hash.slice(1);
      if (!route || route === "dashboard") setView("dashboard");
      else if (route === "customers" || route === "tickets" || route === "packages" || route === "details" || route === "developer" || route === "mcp" || route === "settings" || route === "operations" || route === "imports") setView(route);
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  function navigate(nextView: "dashboard" | "customers" | "tickets" | "packages" | "details" | "developer" | "mcp" | "settings" | "operations" | "imports") {
    setView(nextView);
    window.history.replaceState(null, "", `#${nextView}`);
  }

  async function loadCustomers() {
    try {
      const response = await fetch("/api/customers");
      const json = await response.json();
      if (!response.ok) throw new Error(json.message || "Unable to load customers");
      setCustomers(json.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load customers");
    }
  }

  async function loadTickets() {
    try {
      const response = await fetch("/api/tickets");
      const json = await response.json();
      if (!response.ok) throw new Error(json.message || "Unable to load tickets");
      setAllTickets(json.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load tickets");
    }
  }

  async function refreshData() {
    await Promise.all([loadCustomers(),loadTickets()]);
    const response = await fetch("/api/packages");
    const json = await response.json();
    if (!response.ok) throw new Error(json.message || "Unable to load packages");
    setPackages(json.data);
    if (customer) {
      const detailResponse = await fetch(`/api/customers?cid=${encodeURIComponent(customer.cid)}`);
      if (detailResponse.ok) { const detail = await detailResponse.json();setCustomer(detail.data.customer);setTickets(detail.data.tickets); }
      else {setCustomer(null);setTickets([]);}
    }
  }

  async function lookup(e?: FormEvent) {
    e?.preventDefault(); setLoading(true); setMessage("");
    try {
      const response = await fetch(`/api/customers?search=${encodeURIComponent(cid.trim())}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.message);
      setCustomer(json.data.customer); setTickets(json.data.tickets); navigate("details");
    } catch (error) { setCustomer(null); setTickets([]); setMessage(error instanceof Error ? error.message : "Lookup failed"); }
    finally { setLoading(false); }
  }

  async function createTicket(e: FormEvent) {
    e.preventDefault(); if (!customer) return;
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cid: customer.cid, ...form }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message);
      setMessage(json.data.message); setForm({ ...form, subject: "", description: "" }); await refreshData();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Ticket creation failed"); }
    finally { setLoading(false); }
  }

  async function updateStatus(ticketNo: string, status: string) {
    setLoading(true); setMessage("");
    try {
    const response = await fetch("/api/tickets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticketNo, status }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message || "Unable to update ticket");
      setMessage(json.message);
      if (view === "details") await refreshData();
      await loadTickets();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update ticket");
    } finally {
      setLoading(false);
    }
  }

  async function createCustomer(e: FormEvent) {
    e.preventDefault(); setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(customerForm) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message);
      setMessage(json.message); setCid(json.data.cid); setShowCustomerForm(false);
      setCustomerForm({ cid: "", name: "", phone: "", email: "", address: "", packageId: packages[0] ? String(packages[0].id) : "", nextPaymentDate: "", accountStatus: "active" });
      const customerResponse = await fetch(`/api/customers?cid=${encodeURIComponent(json.data.cid)}`);
      const customerJson = await customerResponse.json();
      if (customerJson.success) { setCustomer(customerJson.data.customer); setTickets(customerJson.data.tickets); navigate("details"); }
      await loadCustomers();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Customer creation failed"); }
    finally { setLoading(false); }
  }

  async function openCustomer(customerCid: string) {
    setCid(customerCid); setLoading(true); setMessage("");
    try {
      const response = await fetch(`/api/customers?cid=${encodeURIComponent(customerCid)}`); const json = await response.json();
      if (!response.ok) throw new Error(json.message);
      setCustomer(json.data.customer); setTickets(json.data.tickets); navigate("details");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Customer lookup failed"); }
    finally { setLoading(false); }
  }

  return <main className="dashboard-shell">
    <aside className="sidebar">
      <div className="side-brand"><span><Wifi size={22}/></span><div><b>NetDesk</b><small>ISP Operations</small></div></div>
      <p className="menu-label">WORKSPACE</p>
      <button className={view === "dashboard" ? "active" : ""} onClick={() => navigate("dashboard")}><LayoutDashboard/><span>Overview</span></button>
      <button className={view === "customers" ? "active" : ""} onClick={() => navigate("customers")}><Users/><span>Customer list</span><b>{customers.length}</b></button>
      <button className={view === "tickets" ? "active" : ""} onClick={() => navigate("tickets")}><TicketIcon/><span>Ticket list</span><b>{allTickets.length}</b></button>
      <button className={view === "packages" ? "active" : ""} onClick={() => navigate("packages")}><Package/><span>Package list</span><b>{packages.length}</b></button>
      <button className={view === "details" ? "active" : ""} onClick={() => navigate("details")}><UserRound/><span>Customer details</span></button>
      <button className={view === "operations" ? "active" : ""} onClick={() => navigate("operations")}><Users/><span>Operations & billing</span></button>
      <button className={view === "imports" ? "active" : ""} onClick={() => navigate("imports")}><Send/><span>Report imports</span></button>
      <p className="menu-label developer-label">SYSTEM</p>
      <button className={view === "developer" ? "active" : ""} onClick={() => navigate("developer")}><Code2/><span>API docs</span></button>
      <button className={view === "mcp" ? "active" : ""} onClick={() => navigate("mcp")}><BookOpen/><span>MCP docs</span></button>
      <button className={view === "settings" ? "active" : ""} onClick={() => navigate("settings")}><Gauge/><span>Settings</span></button>
      <div className="side-bottom"><Wifi size={16}/><div><b>NetDesk workspace</b><small>Customer care & operations</small></div></div>
    </aside>
    <div className="main-area">
    <header>
      <div className="page-context"><LayoutDashboard/><div><b>{view === "dashboard" ? "Overview" : view === "customers" ? "Customers" : view === "tickets" ? "Support tickets" : view === "packages" ? "Internet packages" : view === "developer" ? "API documentation" : view === "mcp" ? "MCP documentation" : view === "settings" ? "Settings" : view === "operations" ? "Operations & billing" : view === "imports" ? "Report imports" : "Customer details"}</b><small>NetDesk dashboard</small></div></div>
      <nav><button onClick={() => setShowCustomerForm(true)}><Plus size={15}/> New customer</button></nav>
    </header>

    {view === "dashboard" && <AnalyticsDashboard onCustomers={() => navigate("customers")} onTickets={() => navigate("tickets")} onPackages={() => navigate("packages")} onNewCustomer={() => setShowCustomerForm(true)} onCustomer={cid => {void openCustomer(cid);}}/>}
    {view === "details" && <section className="hero">
      <div className="lookup-title"><div><p className="eyebrow"><Headphones size={15}/> CUSTOMER LOOKUP</p><h1>Customer details</h1></div><p>Search by CID or phone to review service and billing information.</p></div>
      <form className="search" onSubmit={lookup}>
        <Search size={20}/><input value={cid} onChange={e => setCid(e.target.value)} aria-label="Customer CID or phone" placeholder="Enter CID or phone, e.g. CID-10021 / 01711234567"/><button disabled={loading}>{loading ? "Searching…" : "Find customer"}</button>
      </form>
    </section>}

    {message && view !== "dashboard" && <div className="notice">{message}</div>}

    {showCustomerForm && <div className="modal-backdrop" onMouseDown={() => setShowCustomerForm(false)}>
      <form className="customer-modal" onSubmit={createCustomer} onMouseDown={e => e.stopPropagation()}>
        <div className="modal-head"><div><p className="eyebrow">CUSTOMER MANAGEMENT</p><h2>Create new customer</h2><span>Add the subscriber and assign an internet package.</span></div><button type="button" onClick={() => setShowCustomerForm(false)} aria-label="Close"><X/></button></div>
        <div className="form-grid">
          <label>Customer CID<input required value={customerForm.cid} onChange={e => setCustomerForm({...customerForm, cid:e.target.value})} placeholder="CID-10024"/></label>
          <label>Full name<input required value={customerForm.name} onChange={e => setCustomerForm({...customerForm, name:e.target.value})} placeholder="Customer name"/></label>
          <label>Phone number<input required value={customerForm.phone} onChange={e => setCustomerForm({...customerForm, phone:e.target.value})} placeholder="01XXXXXXXXX"/></label>
          <label>Email address<input type="email" value={customerForm.email} onChange={e => setCustomerForm({...customerForm, email:e.target.value})} placeholder="Optional"/></label>
          <label className="wide">Service address<textarea rows={2} value={customerForm.address} onChange={e => setCustomerForm({...customerForm, address:e.target.value})} placeholder="Installation address"/></label>
          <label>Internet package<select required value={customerForm.packageId} onChange={e => setCustomerForm({...customerForm, packageId:e.target.value})}>{packages.map(pkg => <option value={pkg.id} key={pkg.id}>{pkg.name} — {pkg.speedMbps} Mbps — ৳{Number(pkg.monthlyTotal).toLocaleString()}</option>)}</select></label>
          <label>Next payment date<input required type="date" value={customerForm.nextPaymentDate} onChange={e => setCustomerForm({...customerForm, nextPaymentDate:e.target.value})}/></label>
          <label>Account status<select value={customerForm.accountStatus} onChange={e => setCustomerForm({...customerForm, accountStatus:e.target.value})}><option value="active">Active</option><option value="suspended">Suspended</option><option value="inactive">Inactive</option></select></label>
          <div className="package-preview"><Package size={19}/><div><b>{packages.find(pkg => String(pkg.id) === customerForm.packageId)?.name ?? "Select package"}</b><span>{packages.find(pkg => String(pkg.id) === customerForm.packageId)?.speedMbps ?? 0} Mbps connection</span></div></div>
        </div>
        <div className="modal-actions"><button type="button" onClick={() => setShowCustomerForm(false)}>Cancel</button><button className="primary" disabled={loading}><Plus size={16}/>{loading ? "Creating…" : "Create customer"}</button></div>
      </form>
    </div>}

    {view === "customers" && <section className="list-page">
      <DataManager entity="customers" records={customers} packages={packages} onRefresh={refreshData} accessKey={opsKey} onKeyChange={setOpsKey}/>
      <div className="list-heading"><div><p className="eyebrow">SUBSCRIBER MANAGEMENT</p><h1>Customer list</h1><span>View and manage all ISP customer accounts.</span></div><button onClick={() => setShowCustomerForm(true)}><Plus/> Add customer</button></div>
      <div className="data-card"><div className="table-tools"><div><Search/><input aria-label="Search customers" placeholder="Search CID, name or phone" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}/></div><span>{customers.length} customers</span></div>
      <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Contact</th><th>Package</th><th>Next payment</th><th>Status</th><th>Tickets</th><th></th></tr></thead><tbody>{customers.filter(item=>customerMatchesSearch(item,customerSearch)).map(item => <tr key={item.cid} data-customer={`${item.cid} ${item.name} ${item.phone}`.toLowerCase()} onClick={() => openCustomer(item.cid)}><td><div className="table-person"><i>{item.name.split(' ').map(x=>x[0]).slice(0,2).join('')}</i><span><b>{item.name}</b><small>{item.cid}</small></span></div></td><td><b>{item.phone}</b><small>{item.email || 'No email'}</small></td><td><b>{item.packageName}</b><small>{item.speedMbps} Mbps · ৳{Number(item.packageMonthlyTotal??item.packagePrice).toLocaleString()}</small></td><td>{date(item.nextPaymentDate)}</td><td><span className={`status ${item.accountStatus}`}>{item.accountStatus}</span></td><td>{item.openTickets ?? 0} open</td><td><ChevronRight/></td></tr>)}</tbody></table></div></div>
    </section>}

    {view === "tickets" && <section className="list-page">
      <DataManager entity="tickets" records={allTickets} packages={packages} onRefresh={refreshData} accessKey={opsKey} onKeyChange={setOpsKey}/>
      <div className="list-heading"><div><p className="eyebrow">SUPPORT MANAGEMENT</p><h1>Ticket list</h1><span>Track and update complaints across all customers.</span></div></div>
      <div className="data-card"><div className="table-tools"><div><Search/><input aria-label="Search tickets" placeholder="Search ticket, CID, name or phone" value={ticketSearch} onChange={e=>setTicketSearch(e.target.value)}/></div><span>{allTickets.length} support tickets</span></div><div className="table-wrap"><table><thead><tr><th>Ticket</th><th>Customer</th><th>Issue</th><th>Priority</th><th>Created</th><th>Status</th></tr></thead><tbody>{allTickets.filter(ticket=>!ticketSearch.trim()||[ticket.ticketNo,ticket.subject].some(value=>value.toLowerCase().includes(ticketSearch.trim().toLowerCase()))||customerMatchesSearch({cid:ticket.cid,name:ticket.customerName,phone:ticket.phone},ticketSearch)).map(ticket => <tr key={ticket.ticketNo}><td><b className="ticket-no">{ticket.ticketNo}</b><small>{ticket.noteCount} notes</small></td><td><button className="customer-link" disabled={!ticket.cid} onClick={() => {if(ticket.cid)void openCustomer(ticket.cid);}}>{ticket.customerName}<small>{ticket.cid}</small></button></td><td><b>{ticket.subject}</b><small>{categoryNames[ticket.category]}</small></td><td><span className={`priority ${ticket.priority}`}>{ticket.priority}</span></td><td>{date(ticket.createdAt)}</td><td><select value={ticket.status} onChange={e => updateStatus(ticket.ticketNo,e.target.value)}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></td></tr>)}</tbody></table></div></div>
    </section>}

    {view === "packages" && <section className="list-page">
      <DataManager entity="packages" records={packages} packages={packages} onRefresh={refreshData} accessKey={opsKey} onKeyChange={setOpsKey}/>
      <div className="list-heading"><div><p className="eyebrow">SERVICE CATALOG</p><h1>Package list</h1><span>Internet plans currently available to customers.</span></div></div>
      <PackageCatalog packages={packages} customers={customers} onChoose={id=>{setCustomerForm(current=>({...current,packageId:String(id)}));setShowCustomerForm(true);}}/>
      {packages.length === 0 && <div className="empty"><div><Package size={30}/></div><h2>No packages found</h2><p>Add packages to the database to display them here.</p></div>}
    </section>}

    {view === "operations" && <OperationsWorkspace accessKey={opsKey} onKeyChange={setOpsKey}/>}
    {view === "imports" && <ReportImports accessKey={opsKey} onKeyChange={setOpsKey}/>}
    {view === "mcp" && <McpDocs/>}
    {view === "settings" && <McpSettings/>}
    {view === "developer" && <section className="docs-page">
      <div className="docs-hero"><div><p className="eyebrow"><BookOpen size={14}/> DEVELOPER PORTAL</p><h1>NetDesk API documentation</h1><span>Integrate customer lookup and support ticket workflows with your applications.</span></div><a href="/api/docs" target="_blank">OpenAPI JSON <ExternalLink/></a></div>
      <div className="docs-layout">
        <nav className="docs-nav"><b>API REFERENCE</b><button onClick={() => document.getElementById("customers")?.scrollIntoView({behavior:"smooth"})}>Customers</button><button onClick={() => document.getElementById("packages")?.scrollIntoView({behavior:"smooth"})}>Packages</button><button onClick={() => document.getElementById("tickets")?.scrollIntoView({behavior:"smooth"})}>Tickets</button><button onClick={() => document.getElementById("responses")?.scrollIntoView({behavior:"smooth"})}>Response format</button></nav>
        <div className="docs-content">
          <article className="doc-intro"><h2>Getting started</h2><p>All endpoints accept and return JSON. The local API base URL is:</p><pre><code>http://localhost:3008</code></pre><div className="doc-note"><b>Authentication</b><span>This local version does not currently require an API key. Add authentication before exposing it publicly.</span></div></article>
          <article className="endpoint"><h2>Demo CRUD and bulk import</h2><p>Customer, package and ticket endpoints support PUT for complete edits and DELETE for deletion. Send the identifier in JSON: cid for customers, id for packages, ticketNo for tickets. Updates require all editable fields. Packages also support POST with name, speedMbps and price. A package with subscribers cannot be deleted.</p><p>POST /api/import accepts an entity (customers, packages or tickets) and rows array. Maximum 500 rows. Every row is validated and saved separately; the response includes imported and failed counts plus row-level results. Download the CSV templates from each list page.</p><div className="code-sample"><b>IMPORT REQUEST</b><pre>{JSON.stringify({entity:"packages",rows:[{name:"Demo Plan",speedMbps:50,price:1000}]},null,2)}</pre></div><p>Deleting customers removes their tickets and notes. Ticket deletion also removes its notes.</p></article>

          <section id="customers" className="doc-section"><div className="doc-title"><Users/><div><h2>Customers</h2><p>List, create and retrieve ISP customer accounts.</p></div></div>
            <ApiEndpoint method="GET" path="/api/customers" description="Returns every customer with package, billing status and open-ticket count." response={'{"success":true,"data":[{"cid":"CID-10021","name":"Arif Rahman","packageName":"Family","speedMbps":40,"accountStatus":"active","openTickets":1}]}'} />
            <ApiEndpoint method="GET" path="/api/customers" description="Returns one customer and ten recent tickets. Supply a CID or phone number; the cid parameter tries exact CID before phone fallback." parameters={[{name:"cid",location:"query",required:true,example:"CID-10021"}]} response={'{"success":true,"data":{"customer":{"cid":"CID-10021","name":"Arif Rahman"},"tickets":[]}}'} />
            <ApiEndpoint method="GET" path="/api/customers" description="Look up by phone. Spaces, hyphens and +880 formats are supported. A shared phone returns 409: use CID instead. The search query parameter accepts either CID or phone." parameters={[{name:"phone",location:"query",required:true,example:"01711234567"}]} response={'{"success":true,"data":{"customer":{"cid":"CID-10021","phone":"01711-234567"},"tickets":[]}}'} />
            <ApiEndpoint method="POST" path="/api/customers" description="Creates a customer. CID must be unique." request={'{"cid":"CID-10024","name":"Rahim Ahmed","phone":"01700111222","email":"rahim@example.com","address":"Dhaka","packageId":2,"nextPaymentDate":"2026-09-01","accountStatus":"active"}'} response={'{"success":true,"message":"Customer created successfully","data":{"id":4,"cid":"CID-10024"}}'} />
          </section>

          <section id="packages" className="doc-section"><div className="doc-title"><Package/><div><h2>Packages</h2><p>Read available internet plans.</p></div></div>
            <ApiEndpoint method="GET" path="/api/packages" description="Returns packages ordered by monthly price." response={'{"success":true,"data":[{"id":1,"name":"Starter","speedMbps":20,"price":"800.00"}]}'} />
            <ApiEndpoint method="POST" path="/api/packages" description="Create a package with unlimited hours, connection type, public IPs, one-time OTC, care hours and VAT. Set vatIncluded=false to add VAT above the listed price. Omitted benefits preserve existing values on PUT." request={'{"name":"CONFIDENT+","speedMbps":200,"price":2000,"unlimited":true,"serviceHours":24,"connectionType":"fiber_optics","publicIpCount":0,"otcCharge":0,"supportHours":"24/7","vatPercent":5,"vatIncluded":false}'} response={'{"success":true,"data":{"id":4}}'} />
          </section>

          <section id="tickets" className="doc-section"><div className="doc-title"><TicketIcon/><div><h2>Tickets</h2><p>Create complaints and manage their resolution state.</p></div></div>
            <ApiEndpoint method="GET" path="/api/tickets" description="Returns all tickets with customer information and note count." response={'{"success":true,"data":[{"ticketNo":"TKT-240001","customerName":"Arif Rahman","status":"in_progress"}]}'} />
            <ApiEndpoint method="GET" path="/api/tickets" description="Returns a ticket and every note attached to it when ticketNo is supplied." parameters={[{name:"ticketNo",location:"query",required:true,example:"TKT-240001"}]} response={'{"success":true,"data":{"ticket":{"ticketNo":"TKT-240001"},"notes":[]}}'} />
            <ApiEndpoint method="POST" path="/api/tickets" description="Creates a ticket using cid or phone. An unresolved ticket in the same customer/category receives a note instead of a duplicate ticket." request={'{"cid":"CID-10021","category":"no_internet","subject":"No connection","description":"Connection is unavailable.","priority":"high"}'} response={'{"success":true,"data":{"action":"created","ticketNo":"TKT-12345678","message":"Ticket created successfully."}}'} />
            <ApiEndpoint method="PATCH" path="/api/tickets" description="Updates a ticket to open, in_progress, resolved or closed. The ticket number is sent in the JSON body." request={'{"ticketNo":"TKT-240001","status":"resolved"}'} response={'{"success":true,"message":"Ticket status updated"}'} />
          </section>

          <section id="responses" className="doc-section response-doc"><h2>Response conventions</h2><p>Successful responses contain <code>success: true</code>. Errors contain <code>success: false</code> and a readable <code>message</code>.</p><div className="status-codes"><span><b>200</b> Success</span><span><b>201</b> Created</span><span><b>400</b> Invalid input</span><span><b>404</b> Not found</span><span><b>409</b> Duplicate CID</span><span><b>500</b> Server error</span></div></section>
        </div>
      </div>
    </section>}

    {view === "details" && (!customer ? <section className="empty"><div><UserRound size={30}/></div><h2>Look up a customer to begin</h2><p>Account, package, billing and ticket details will appear here.</p></section> : <>
      <section className="customer-head">
        <div className="avatar">{customer.name.split(" ").map(x => x[0]).slice(0,2).join("")}</div>
        <div className="customer-title"><div><h2>{customer.name}</h2><span className={`status ${customer.accountStatus}`}>{customer.accountStatus}</span></div><p>{customer.cid} · Customer account</p></div>
        <div className="contact"><span><Phone size={15}/>{customer.phone}</span><span><MapPin size={15}/>{customer.address}</span></div>
      </section>

      <section className="stat-grid">
        <article><div className="icon blue"><Gauge/></div><p>Current package</p><h3>{customer.packageName}</h3><small>{customer.speedMbps} Mbps broadband</small></article>
        <article><div className="icon purple"><CircleDollarSign/></div><p>Monthly price</p><h3>৳{Number(customer.packageMonthlyTotal??customer.packagePrice).toLocaleString()}</h3><small>{Number(customer.vatPercent||0)>0?`${customer.vatPercent}% VAT ${customer.vatIncluded?"included":"added"}`:"No added VAT"}</small></article>
        <article><div className="icon orange"><CalendarDays/></div><p>Next payment</p><h3>{date(customer.nextPaymentDate)}</h3><small>Billing cycle due date</small></article>
        <article><div className="icon green"><Activity/></div><p>Account status</p><h3>{pretty(customer.accountStatus)}</h3><small>Service {customer.accountStatus === "active" ? "is running normally" : "needs attention"}</small></article>
      </section>

      <section className="customer-package-features panel"><h3>Package benefits</h3><div><span>{customer.serviceHours??24} hours {customer.unlimited?"unlimited":"internet access"}</span><span>{connectionNames[customer.connectionType||"fiber_optics"]||customer.connectionType}</span><span>{Number(customer.publicIpCount||0)} public IPs</span><span>OTC: {Number(customer.otcCharge||0)===0?"Free":`৳${Number(customer.otcCharge).toLocaleString()} (one-time)`}</span><span>{customer.supportHours||"24/7"} customer care</span></div></section>
      <section className="workspace">
        <div className="tickets panel">
          <div className="panel-title"><div><p className="eyebrow">SERVICE HISTORY</p><h2>Recent tickets</h2></div><span>{tickets.length} total</span></div>
          {tickets.length === 0 ? <div className="no-tickets">No tickets for this customer.</div> : tickets.map(ticket => <article className="ticket" key={ticket.ticketNo}>
            <div className="ticket-top"><div><span className="ticket-no">{ticket.ticketNo}</span><span className={`priority ${ticket.priority}`}>{ticket.priority}</span></div><span className={`status ${ticket.status}`}>{pretty(ticket.status)}</span></div>
            <h3>{ticket.subject}</h3><p>{categoryNames[ticket.category]} · Opened {date(ticket.createdAt)} {Number(ticket.noteCount) > 0 && `· ${ticket.noteCount} notes`}</p>
            <select value={ticket.status} onChange={e => updateStatus(ticket.ticketNo, e.target.value)} aria-label="Update ticket status"><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select>
          </article>)}
        </div>

        <form className="new-ticket panel" onSubmit={createTicket}>
          <div className="panel-title"><div><p className="eyebrow">NEW COMPLAINT</p><h2>Create a ticket</h2></div><Send size={20}/></div>
          <label>Category<select value={form.category} onChange={e => setForm({...form, category:e.target.value})}>{Object.entries(categoryNames).map(([v,l]) => <option value={v} key={v}>{l}</option>)}</select></label>
          <label>Priority<select value={form.priority} onChange={e => setForm({...form, priority:e.target.value})}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
          <label>Subject<input required value={form.subject} onChange={e => setForm({...form, subject:e.target.value})} placeholder="Short summary"/></label>
          <label>Complaint details<textarea required rows={5} value={form.description} onChange={e => setForm({...form, description:e.target.value})} placeholder="Describe the customer's issue…"/></label>
          <div className="tip">If an unresolved ticket exists in this category, this complaint will be added to it as a note.</div>
          <button className="submit" disabled={loading}>Submit ticket <Send size={16}/></button>
        </form>
      </section>
      <OperationsWorkspace cid={customer.cid} accessKey={opsKey} onKeyChange={setOpsKey}/>
    </>)}
    </div>
  </main>;
}

function ApiEndpoint({ method, path, description, request, response, parameters }: { method: "GET" | "POST" | "PATCH"; path: string; description: string; request?: string; response: string; parameters?: {name:string;location:"query";required:boolean;example:string}[] }) {
  return <article className="endpoint"><div className="endpoint-head"><span className={`method ${method.toLowerCase()}`}>{method}</span><code>{path}</code></div><p>{description}</p>{parameters && <div className="parameter-list"><b>PARAMETERS</b>{parameters.map(parameter => <div key={parameter.name}><code>{parameter.name}</code><span>{parameter.location}</span><i>{parameter.required ? "required" : "optional"}</i><small>Example: {parameter.example}</small></div>)}<pre><code>{`${path}?${parameters.map(parameter => `${parameter.name}=${encodeURIComponent(parameter.example)}`).join("&")}`}</code></pre></div>}{request && <div className="code-sample"><b>REQUEST BODY</b><pre><code>{JSON.stringify(JSON.parse(request), null, 2)}</code></pre></div>}<div className="code-sample"><b>EXAMPLE RESPONSE</b><pre><code>{JSON.stringify(JSON.parse(response), null, 2)}</code></pre></div></article>;
}
