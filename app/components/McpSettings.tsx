"use client";
import { FormEvent, useEffect, useState } from "react";

export default function McpSettings() {
  const [origins,setOrigins]=useState<string[]>([]);
  const [origin,setOrigin]=useState("");
  const [key,setKey]=useState("");
  const [source,setSource]=useState("");
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [dirty,setDirty]=useState(false);
  async function load() {
    setBusy(true);setError("");
    try{const response=await fetch("/api/settings/mcp");const json=await response.json();if(!response.ok)throw new Error(json.message);setOrigins(json.data.origins);setSource(json.data.source);setLoaded(true);setDirty(false);}
    catch(e){setError(e instanceof Error?e.message:"Unable to load settings");}
    finally{setBusy(false);}
  }
  useEffect(()=>{void load();},[]);
  function add(event:FormEvent) {
    event.preventDefault();setError("");setMessage("");
    try{
      const url=new URL(origin.trim());
      if(!["http:","https:"].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=="/"||url.hostname.includes("*"))throw new Error("Use protocol + domain + optional port, without a path or wildcard.");
      if(origins.includes(url.origin))throw new Error("This origin is already in the list.");
      if(origins.length>=100)throw new Error("Maximum 100 origins.");
      setOrigins([...origins,url.origin]);setOrigin("");setDirty(true);
    }catch(e){setError(e instanceof TypeError?"Enter a valid URL such as https://client.example.com":e instanceof Error?e.message:"Invalid origin");}
  }
  async function save(event:FormEvent) {
    event.preventDefault();setBusy(true);setMessage("");setError("");
    try{
      const response=await fetch("/api/settings/mcp",{method:"PUT",headers:{"Content-Type":"application/json",},body:JSON.stringify({origins})});
      const json=await response.json();if(!response.ok)throw new Error(json.message||json.error||"Unable to save settings");
      setOrigins(json.data.origins);setSource(json.data.source);setDirty(false);setMessage(json.message);setKey("");
    }catch(e){setError(e instanceof Error?e.message:"Unable to save settings");}
    finally{setBusy(false);}
  }
  return <section className="list-page settings-page"><div className="list-heading"><div><p className="eyebrow">SETTINGS</p><h1>MCP settings</h1><span>Control which browser clients may connect to MCP.</span></div></div>
    <div className="panel settings-card"><h2>Allowed origins</h2><p>Add the address of each trusted browser client. Use a full origin such as <code>https://client.example.com</code> or <code>http://localhost:3008</code>, without <code>/mcp/v1</code>.</p>
      {error&&<p className="settings-error" role="alert">{error}</p>}{message&&<p className="settings-success" role="status">{message}</p>}
      {!loaded?<button disabled={busy} onClick={()=>void load()}>{busy?"Loading…":"Retry loading settings"}</button>:<>
        <form className="origin-add" onSubmit={add}><label htmlFor="new-origin">Add new origin</label><div><input id="new-origin" type="url" required placeholder="https://client.example.com" value={origin} onChange={e=>setOrigin(e.target.value)} disabled={busy}/><button disabled={busy||!origin.trim()}>Add origin</button></div></form>
        <ul className="origin-list">{origins.map(item=><li key={item}><code>{item}</code><button disabled={busy} aria-label={`Remove ${item}`} onClick={()=>{setOrigins(origins.filter(value=>value!==item));setDirty(true);setMessage("");}}>Remove</button></li>)}</ul>
        {origins.length===0&&<p>No browser origins allowed. Native clients without an Origin header can still connect using the MCP key.</p>}
        <form className="settings-save" onSubmit={save}><small>Your dashboard login authorizes settings changes. External MCP clients still require a bearer key.</small><div><button disabled={busy||!dirty}>{busy?"Saving…":"Save changes"}</button><button type="button" disabled={busy||!dirty} onClick={()=>{setMessage("");void load();}}>Discard changes</button>{dirty&&<span>Unsaved changes</span>}</div></form>
        <p className="settings-footnote">Current source: {source === "settings"?"saved UI settings":source === "environment"?"MCP_ALLOWED_ORIGINS in .env":"default origins"}. Saved settings take effect immediately and survive restarts. Bearer authentication remains required for every MCP client.</p>
      </>}
    </div></section>;
}
