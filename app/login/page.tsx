"use client";
import { FormEvent, useState } from 'react';
import { LockKeyhole, Wifi } from 'lucide-react';
import './login.css';
export default function Login(){
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError('');try{
  const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
  const body=await response.json();if(!response.ok)throw new Error(body.message||'Login failed.');window.location.replace('/');
 }catch(e){setError(e instanceof Error?e.message:'Unable to sign in.');setBusy(false);}}
 return <main className="login-shell"><section className="login-intro"><div className="login-brand"><Wifi size={30}/><span>NetDesk</span></div><span className="login-kicker">ISP OPERATIONS WORKSPACE</span><h1>Your customers.<br/>Your network.<br/><em>One secure workspace.</em></h1><p>Manage customer accounts, resolve support tickets and keep billing organized.</p><small>Authorized staff access only</small></section><section className="login-area"><form className="login-card" onSubmit={submit}><span className="login-lock"><LockKeyhole size={25}/></span><h2>Welcome back</h2><p>Sign in to your NetDesk dashboard.</p>{error&&<div className="login-error" role="alert">{error}</div>}<label htmlFor="username">User ID<input id="username" autoComplete="username" required maxLength={80} value={username} onChange={e=>setUsername(e.target.value)} placeholder="Enter your user ID" disabled={busy}/></label><label htmlFor="password">Password<input id="password" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password" disabled={busy}/></label><button disabled={busy}>{busy?'Signing in…':'Sign in'}</button><small>Need access or a password reset? Contact your administrator.</small></form></section></main>;
}
