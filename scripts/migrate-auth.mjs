import fs from 'node:fs';
import mysql from 'mysql2/promise';
if(fs.existsSync('.env'))process.loadEnvFile('.env');
const connection=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'isp_system',multipleStatements:true});
try{await connection.query(fs.readFileSync('database/auth.sql','utf8'));console.log('Login tables ready; existing records preserved.');}finally{await connection.end();}
