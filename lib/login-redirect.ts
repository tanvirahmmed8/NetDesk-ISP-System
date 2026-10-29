// request.url may contain the standalone listener's localhost origin behind Nginx.
// Production deploys pin the public origin; local development uses the Host header.
export function loginRedirectUrl(request:Request, publicUrl=process.env.NETDESK_PUBLIC_URL):URL {
  if(publicUrl){
    const origin=new URL(publicUrl);
    if(!['http:','https:'].includes(origin.protocol)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash){
      throw new Error('NETDESK_PUBLIC_URL must be an HTTP(S) origin without a path or credentials.');
    }
    return new URL('/login',origin.origin);
  }
  const incoming=new URL(request.url);
  const host=request.headers.get('host')||incoming.host;
  if(!/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[a-f0-9:.]+\])(?::\d{1,5})?$/i.test(host))throw new Error('Invalid request host');
  // Never use X-Forwarded-Host: clients can supply it unless the proxy overwrites it.
  const forwardedProto=request.headers.get('x-forwarded-proto');
  const protocol=forwardedProto==='https'?'https:':forwardedProto==='http'?'http:':incoming.protocol;
  if(!['http:','https:'].includes(protocol))throw new Error('Invalid request protocol');
  return new URL('/login',`${protocol}//${host}`);
}
