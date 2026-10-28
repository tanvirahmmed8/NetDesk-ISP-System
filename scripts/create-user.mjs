import fs from 'node:fs';
import { randomBytes, scrypt, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline/promises';
import mysql from 'mysql2/promise';
if(fs.existsSync('.env'))process.loadEnvFile('.env');
const username=(process.argv[2]||'').trim().toLowerCase();
if(!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(username)){console.error('Usage: npm run auth:create-user -- admin (user ID: 3–80 letters, numbers, dots, underscores or hyphens)');process.exit(1);}
async function secret(prompt){
 if(!process.stdin.isTTY)throw new Error('Run this command in an interactive terminal.');
 process.stdout.write(prompt);process.stdin.setRawMode(true);process.stdin.resume();process.stdin.setEncoding('utf8');
 return new Promise((resolve,reject)=>{
  let value='';const finish=()=>{process.stdin.off('data',onData);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');};
  const onData=chunk=>{for(const character of chunk){if(character==='\u0003'){finish();reject(new Error('Cancelled'));return;}if(character==='\r'||character==='\n'){finish();resolve(value);return;}if(character==='\u007f'||character==='\b'){value=value.slice(0,-1);}else if(character>=' '&&value.length<256)value+=character;}};
  process.stdin.on('data',onData);
 });
}
let connection;
try{
 const password=await secret('New password (hidden, at least 6 characters): ');
 if(password.length<6||password.length>256)throw new Error('Use 6–256 characters.');
 if(await secret('Confirm password: ')!==password)throw new Error('Passwords do not match.');
 connection=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'isp_system'});
 const [existing]=await connection.execute('SELECT id FROM app_users WHERE username=?',[username]);
 if(existing.length){const rl=createInterface({input:process.stdin,output:process.stdout});let answer;try{answer=await rl.question(`User ${username} already exists. Reset password and revoke all their sessions? [yes/no] `);}finally{rl.close();}if(answer!=='yes')throw new Error('Cancelled; user unchanged.');}
 const salt=randomBytes(16).toString('hex');const hash=await promisify(scrypt)(password,salt,64);const stored=`scrypt:${salt}:${hash.toString('hex')}`;
 await connection.beginTransaction();
 if(existing.length){await connection.execute('UPDATE app_users SET password_hash=?,active=1 WHERE id=?',[stored,existing[0].id]);await connection.execute('DELETE FROM app_sessions WHERE user_id=?',[existing[0].id]);}
 else await connection.execute('INSERT INTO app_users(username,password_hash) VALUES(?,?)',[username,stored]);
 await connection.execute('DELETE FROM app_login_limits WHERE bucket=?',[createHash('sha256').update(`user:${username}`).digest('hex')]);
 await connection.commit();console.log(`User ${username} ${existing.length?'reset':'created'}. Sign in at /login. No password was stored in plaintext.`);
}catch(error){if(connection)await connection.rollback().catch(()=>{});console.error(error.message);process.exitCode=1;}finally{if(connection)await connection.end();}
