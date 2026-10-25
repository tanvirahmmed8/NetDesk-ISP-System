import { NextResponse } from "next/server";
import { errorMessage, InputError } from "./manage";

export function apiError(error: unknown) {
  if(["ER_ROW_IS_REFERENCED_2","ER_NO_REFERENCED_ROW_2"].includes((error as {code?:string})?.code||""))return NextResponse.json({success:false,message:"Record is in use or a referenced record is missing"},{status:409});
  if(error instanceof InputError)return NextResponse.json({success:false,message:error.message},{status:error.status});
  if(error instanceof SyntaxError)return NextResponse.json({success:false,message:"Invalid JSON"},{status:400});
  if((error as {code?:string})?.code === "ER_DUP_ENTRY")return NextResponse.json({success:false,message:errorMessage(error)},{status:409});
  console.error(error);
  const message = error instanceof Error && error.message === "CUSTOMER_NOT_FOUND"
    ? "Customer not found"
    : "Unable to process the request";
  return NextResponse.json({ success: false, message }, { status: message === "Customer not found" ? 404 : 500 });
}
