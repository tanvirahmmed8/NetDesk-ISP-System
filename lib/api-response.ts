/** Read API responses without leaking HTML error pages into JSON.parse errors. */
export async function readApiResponse(response:Response){
 const text=await response.text();
 let json;
 try{json=JSON.parse(text);}catch{
  if(response.redirected)throw new Error('The request was redirected instead of returning JSON. Sign in again and retry.');
  const hints:Record<number,string>={401:'Sign in again and retry.',403:'Access denied. Check your login and request origin.',413:'The reverse proxy rejected the upload size. Check its request-body limit.',502:'The reverse proxy could not reach the application. Check PM2 and proxy logs.',504:'The reverse proxy timed out. Check application and proxy logs.'};
  throw new Error(`API returned a non-JSON response (HTTP ${response.status}). ${hints[response.status]||'Check application and reverse-proxy logs.'}`);
 }
 if(!json||typeof json!=='object'||Array.isArray(json))throw new Error(`API returned an invalid response (HTTP ${response.status}).`);
 if(!response.ok||json.success===false)throw new Error(json.message||json.error||`Request failed (HTTP ${response.status}).`);
 return json;
}
