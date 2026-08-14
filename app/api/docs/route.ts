import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "NetDesk ISP API",
      version: "1.0.0",
      description: "Customer, package and support-ticket API for the NetDesk ISP system.",
    },
    servers: [{ url: "http://localhost:3008", description: "Local development" }],
    tags: [
      { name: "Customers", description: "Customer account operations" },
      { name: "Packages", description: "Internet package operations" },
      { name: "Tickets", description: "Support ticket operations" },
    ],
    paths: {
      "/api/customers": {
        get: { tags: ["Customers"], summary: "List customers or get one customer", parameters: [{ name: "cid", in: "query", required: false, description: "Provide a CID to return one customer and their recent tickets. Omit it to list all customers.", schema: { type: "string" }, example: "CID-10021" }], responses: { "200": { description: "Customer list or details", content: { "application/json": { schema: { $ref: "#/components/schemas/CustomerListResponse" } } } }, "404": { description: "Customer not found" } } },
        post: {
          tags: ["Customers"], summary: "Create customer",
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateCustomer" } } } },
          responses: { "201": { description: "Customer created" }, "400": { description: "Invalid request" }, "409": { description: "CID already exists" } },
        },
      },
      "/api/packages": {
        get: { tags: ["Packages"], summary: "List internet packages", responses: { "200": { description: "Package list" } } },
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
    components: { schemas: {
      CreateCustomer: { type: "object", required: ["cid", "name", "phone", "packageId", "nextPaymentDate"], properties: { cid: { type: "string", example: "CID-10024" }, name: { type: "string", example: "Rahim Ahmed" }, phone: { type: "string", example: "01700111222" }, email: { type: ["string", "null"], format: "email" }, address: { type: ["string", "null"] }, packageId: { type: "integer", example: 2 }, nextPaymentDate: { type: "string", format: "date" }, accountStatus: { type: "string", enum: ["active", "suspended", "inactive"], default: "active" } } },
      CreateTicket: { type: "object", required: ["cid", "category", "subject", "description"], properties: { cid: { type: "string", example: "CID-10021" }, category: { type: "string", enum: ["no_internet", "slow_speed", "billing", "line_issue", "other"] }, subject: { type: "string", example: "No connection" }, description: { type: "string", example: "Connection has been unavailable since morning." }, priority: { type: "string", enum: ["low", "medium", "high", "urgent"], default: "medium" } } },
      CustomerListResponse: { type: "object", properties: { success: { type: "boolean", example: true }, data: { type: "array", items: { type: "object" } } } },
    } },
  });
}
