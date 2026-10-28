import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sessionUser } from '@/lib/auth';
import Dashboard from './components/Dashboard';
export const dynamic='force-dynamic';
export default async function Home(){
 let user=null;try{user=await sessionUser(new Request('http://localhost',{headers:await headers()}));}catch{/* Fail closed. */}
 if(!user)redirect('/login');
 return <Dashboard/>;
}
