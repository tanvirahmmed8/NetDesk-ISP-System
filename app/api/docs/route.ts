import { NextResponse } from "next/server";

const packageProperties={name:{type:"string",example:"CONFIDENT+"},speedMbps:{type:"integer",minimum:1,example:200},price:{type:"number",minimum:0,example:2000},unlimited:{type:"boolean",default:true},serviceHours:{type:"integer",minimum:1,maximum:24,default:24},connectionType:{type:"string",enum:["fiber_optics","wireless","ethernet","other"],default:"fiber_optics"},publicIpCount:{type:"integer",minimum:0,maximum:1000,default:0},otcCharge:{type:"number",minimum:0,default:0,description:"One-time connection charge, excluded from monthly totals"},supportHours:{type:"string",default:"24/7"},vatPercent:{type:"number",minimum:0,maximum:100,default:0},vatIncluded:{type:"boolean",default:true,description:"False adds VAT on top of price; true means price already includes VAT"}};

export async function GET() {
  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "NetDesk ISP API",
      version: "1.0.0",
      description: "Customer, package and support-ticket API for the NetDesk ISP system.",
    },
    security: [{mcpBearer:[]},{dashboardSession:[]}],
    servers: [{ url: "http://localhost:3008", description: "Local development" }],
    tags: [
      { name: "Customers", description: "Customer account operations" },
      { name: "Packages", description: "Internet package operations" },
      { name: "Tickets", description: "Support ticket operations" },
    ],
    paths: {
      "/api/operations":{get:{tags:["Operations"],summary:"Protected operation records or customer/ticket history",security:[{mcpBearer:[]},{dashboardSession:[]}],parameters:[{name:"entity",in:"query",required:true,schema:{type:"string",enum:["pops","teams","employees","issue-types","followups","invoices","payments","customers","tickets"]}},{name:"cid",in:"query",schema:{type:"string"}},{name:"detail",in:"query",schema:{type:"string",enum:["1"]}},{name:"key",in:"query",schema:{type:"string"}}],responses:{"200":{description:"Records or operational detail"},"401":{description:"Bearer key required"}}},post:{summary:"Create operation record",security:[{mcpBearer:[]},{dashboardSession:[]}],requestBody:{required:true,content:{"application/json":{schema:{type:"object"}}}},responses:{"200":{description:"Saved"},"409":{description:"Balance or reference conflict"}}},put:{summary:"Update operation record with id",security:[{mcpBearer:[]},{dashboardSession:[]}],requestBody:{required:true,content:{"application/json":{schema:{type:"object",required:["id"]}}}},responses:{"200":{description:"Updated"}}},delete:{summary:"Delete operation record with guards and audit history",security:[{mcpBearer:[]},{dashboardSession:[]}],requestBody:{required:true,content:{"application/json":{schema:{type:"object",required:["id"]}}}},responses:{"200":{description:"Deleted"},"409":{description:"Record is used or has payments"}}}},
      "/api/report-imports":{get:{tags:["Report imports"],summary:"Protected review batches; optional id reads batch rows",security:[{mcpBearer:[]},{dashboardSession:[]}],parameters:[{name:"id",in:"query",schema:{type:"integer"}}],responses:{"200":{description:"Batches or original/mapped rows"},"401":{description:"Bearer key required"}}},post:{summary:"Preview, stage, edit, revalidate or commit a report",security:[{mcpBearer:[]},{dashboardSession:[]}],requestBody:{required:true,content:{"application/json":{schema:{type:"object",required:["action"],properties:{action:{type:"string",enum:["preview","stage","edit","revalidate","commit"]},kind:{type:"string",enum:["customers","tickets"]},csv:{type:"string"},batchId:{type:"integer"},rowId:{type:"integer"},payload:{type:"object"},options:{type:"object"}}}}}},responses:{"200":{description:"Preview, queue or per-row commit results"},"400":{description:"Invalid input"},"401":{description:"Bearer key required"}}}},
      "/api/analytics": {get:{tags:["Analytics"],summary:"Live home dashboard analytics",description:"Current account/ticket totals, estimated active monthly package value, daily new-record trends, package distribution, payment-date schedule and recent tickets. Dates use Asia/Dhaka. Monthly values are not recorded payments.",parameters:[{name:"days",in:"query",schema:{type:"integer",enum:[7,30,90],default:30}}],responses:{"200":{description:"Live analytics snapshot"},"400":{description:"Invalid date range"},"503":{description:"Database unavailable"}}}},
      "/api/settings/mcp": {
        get:{summary:"Read allowed browser origins",responses:{"200":{description:"Origins and source: settings, environment or default"}}},
        put:{summary:"Save browser origins; takes effect immediately",security:[{mcpBearer:[]},{dashboardSession:[]}],requestBody:{required:true,content:{"application/json":{schema:{type:"object",required:["origins"],properties:{origins:{type:"array",maxItems:100,items:{type:"string",format:"uri"}}}}}}},responses:{"200":{description:"Origins saved"},"400":{description:"Invalid origin"},"401":{description:"Invalid MCP key"},"503":{description:"Server key not configured"}}},
      },
      "/api/import": {
        post: {summary:"Bulk create records with per-row results",requestBody:{required:true,content:{"application/json":{schema:{type:"object",required:["entity","rows"],properties:{entity:{type:"string",enum:["customers","packages","tickets"]},rows:{type:"array",minItems:1,maxItems:500,items:{type:"object"}}}}}}},responses:{"200":{description:"Imported and failed counts with row results"},"400":{description:"Invalid payload"}}},
      },
      "/api/manage/{entity}": {
        parameters:[{name:"entity",in:"path",required:true,schema:{type:"string",enum:["customers","packages","tickets"]}}],
        post:{summary:"Create customer, package or ticket",requestBody:{required:true,content:{"application/json":{schema:{type:"object"}}}},responses:{"200":{description:"Record saved or repeat complaint added as note"}}},
        put:{summary:"Update all editable fields; identify with cid, package id or ticketNo",requestBody:{required:true,content:{"application/json":{schema:{type:"object"}}}},responses:{"200":{description:"Record updated"},"404":{description:"Not found"},"409":{description:"Conflict"}}},
        delete:{summary:"Delete record; send cid, package id or ticketNo",requestBody:{required:true,content:{"application/json":{schema:{type:"object"}}}},responses:{"200":{description:"Deleted; related tickets and notes cascade"},"409":{description:"Package still has subscribers"}}},
      },
      "/api/customers": {
        get: { tags: ["Customers"], summary: "List customers or find one by CID / phone", parameters: [{ name: "cid", in: "query", required: false, description: "CID or phone lookup. Exact CID takes priority; phone fallback supports formatting and +880. Omit all lookup parameters to list customers.", schema: { type: "string" }, example: "CID-10021" },{name:"phone",in:"query",required:false,schema:{type:"string"},example:"01711234567",description:"Phone lookup; shared phone numbers return 409. If cid is also supplied both must identify the same customer."},{name:"search",in:"query",required:false,schema:{type:"string"},description:"Single CID-or-phone input. Use alone."}], responses: { "200": { description: "Customer list or details", content: { "application/json": { schema: { $ref: "#/components/schemas/CustomerListResponse" } } } }, "404": { description: "Customer not found" }, "400":{description:"Invalid lookup"}, "409":{description:"Phone is ambiguous or conflicts with CID"} } },
        post: {
          tags: ["Customers"], summary: "Create customer",
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateCustomer" } } } },
          responses: { "201": { description: "Customer created" }, "400": { description: "Invalid request" }, "409": { description: "CID already exists" } },
        },
      },
      "/api/packages": {
        get: { tags: ["Packages"], summary: "List internet packages", responses: { "200": { description: "Package list" } } },
        post:{tags:["Packages"],summary:"Create package with benefits, OTC and VAT",requestBody:{required:true,content:{"application/json":{schema:{$ref:"#/components/schemas/PackageWrite"}}}},responses:{"201":{description:"Package created"},"400":{description:"Invalid fields"}}},
        put:{tags:["Packages"],summary:"Update package; omitted benefit fields retain existing values",requestBody:{required:true,content:{"application/json":{schema:{allOf:[{$ref:"#/components/schemas/PackageWrite"},{type:"object",required:["id"],properties:{id:{type:"integer"}}}]}}}},responses:{"200":{description:"Package updated"},"404":{description:"Package not found"}}},
        delete:{tags:["Packages"],summary:"Delete unused package",requestBody:{required:true,content:{"application/json":{schema:{type:"object",required:["id"],properties:{id:{type:"integer"}}}}}},responses:{"200":{description:"Package deleted"},"409":{description:"Package is subscribed"}}},
      },
      "/api/tickets": {
        get: { tags: ["Tickets"], summary: "List tickets or get one ticket", parameters: [{ name: "ticketNo", in: "query", required: false, description: "Provide a ticket number to return its details and notes. Omit it to list all tickets.", schema: { type: "string" }, example: "TKT-240001" }], responses: { "200": { description: "Ticket list or details" }, "404": { description: "Ticket not found" } } },
        post: {
          tags: ["Tickets"], summary: "Create a ticket or append a duplicate complaint note",
          description: "When the customer already has an open or in-progress ticket in the same category, the complaint is added as a note to that ticket.",
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateTicket" } } } },
          responses: { "201": { description: "New ticket created" }, "200": { description: "Note added to existing unresolved ticket" }, "400": { description: "Invalid request" }, "404": { description: "Customer not found" } },
        },
        patch: {
          tags: ["Tickets"], summary: "Update ticket status",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["ticketNo", "status"], properties: { ticketNo: { type: "string", example: "TKT-240001" }, status: { type: "string", enum: ["open", "in_progress", "resolved", "closed"] } } } } } },
          responses: { "200": { description: "Status updated" }, "400": { description: "Invalid status" }, "404": { description: "Ticket not found" } },
        },
      },
    },
    components: { securitySchemes:{mcpBearer:{type:"http",scheme:"bearer"},dashboardSession:{type:"apiKey",in:"cookie",name:"netdesk_session"}}, schemas: {
      PackageWrite:{type:"object",required:["name","speedMbps","price"],properties:packageProperties},
      CreateCustomer: { type: "object", required: ["cid", "name", "phone", "packageId", "nextPaymentDate"], properties: { cid: { type: "string", example: "CID-10024" }, name: { type: "string", example: "Rahim Ahmed" }, phone: { type: "string", example: "01700111222" }, email: { type: ["string", "null"], format: "email" }, address: { type: ["string", "null"] }, packageId: { type: "integer", example: 2 }, nextPaymentDate: { type: "string", format: "date" }, accountStatus: { type: "string", enum: ["active", "suspended", "inactive"], default: "active" } } },
      CreateTicket: { type: "object", required: ["category", "subject", "description"], anyOf:[{required:["cid"]},{required:["phone"]}], properties: { cid: { type: "string", example: "CID-10021",description:"Supply CID or phone" }, phone:{type:"string",example:"01711234567",description:"Alternative customer identifier"}, category: { type: "string", enum: ["no_internet", "slow_speed", "billing", "line_issue", "other"] }, subject: { type: "string", example: "No connection" }, description: { type: "string", example: "Connection has been unavailable since morning." }, priority: { type: "string", enum: ["low", "medium", "high", "urgent"], default: "medium" } } },
      CustomerListResponse: { type: "object", properties: { success: { type: "boolean", example: true }, data: { type: "array", items: { type: "object" } } } },
    } },
  });
}
