import { NextResponse } from "next/server";

export function apiError(error: unknown) {
  console.error(error);
  const message = error instanceof Error && error.message === "CUSTOMER_NOT_FOUND"
    ? "Customer not found"
    : "Unable to process the request";
  return NextResponse.json({ success: false, message }, { status: message === "Customer not found" ? 404 : 500 });
}
