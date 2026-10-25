import fs from "node:fs";
import mysql from "mysql2/promise";
if(fs.existsSync(".env"))process.loadEnvFile(".env");
const connection=await mysql.createConnection({host:process.env.DB_HOST||"127.0.0.1",port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||"root",password:process.env.DB_PASSWORD||"",database:process.env.DB_NAME||"isp_system"});
const columns={unlimited:"BOOLEAN NOT NULL DEFAULT TRUE",service_hours:"TINYINT UNSIGNED NOT NULL DEFAULT 24",connection_type:"VARCHAR(30) NOT NULL DEFAULT 'fiber_optics'",public_ip_count:"SMALLINT UNSIGNED NOT NULL DEFAULT 0",otc_charge:"DECIMAL(10,2) NOT NULL DEFAULT 0",support_hours:"VARCHAR(60) NOT NULL DEFAULT '24/7'",vat_percent:"DECIMAL(5,2) NOT NULL DEFAULT 0",vat_included:"BOOLEAN NOT NULL DEFAULT TRUE"};
try{
  const [existing]=await connection.query("SHOW COLUMNS FROM packages");
  const missing=Object.entries(columns).filter(([name])=>!existing.some(column=>column.Field===name));
  if(missing.length)await connection.query("ALTER TABLE packages "+missing.map(([name,definition])=>`ADD COLUMN ${name} ${definition}`).join(", "));
  console.log(`Package fields migration complete: ${missing.length} columns added. Existing records and prices preserved.`);
}finally{await connection.end();}
