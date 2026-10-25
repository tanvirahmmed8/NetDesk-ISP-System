import fs from "node:fs";
import mysql from "mysql2/promise";
if(fs.existsSync(".env"))process.loadEnvFile(".env");
const connection=await mysql.createConnection({host:process.env.DB_HOST||"127.0.0.1",port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||"root",password:process.env.DB_PASSWORD||"",database:process.env.DB_NAME||"isp_system",multipleStatements:true});
const customers={district:"VARCHAR(100) NULL",upazila:"VARCHAR(100) NULL",pop_id:"INT UNSIGNED NULL",customer_type:"VARCHAR(30) NOT NULL DEFAULT 'unknown'",registration_status:"VARCHAR(40) NOT NULL DEFAULT 'active'",registration_date:"DATE NULL",agreed_mrc:"DECIMAL(10,2) NULL",agreed_otc:"DECIMAL(10,2) NULL",payment_status:"VARCHAR(30) NOT NULL DEFAULT 'unknown'"};
const tickets={source:"VARCHAR(60) NOT NULL DEFAULT 'manual'",issue_type_id:"INT UNSIGNED NULL",ticket_kind:"VARCHAR(30) NOT NULL DEFAULT 'support'",assigned_team_id:"INT UNSIGNED NULL",assigned_member_id:"INT UNSIGNED NULL",created_by_id:"INT UNSIGNED NULL",assigned_by_id:"INT UNSIGNED NULL",forwarded_by_id:"INT UNSIGNED NULL",resolved_by_id:"INT UNSIGNED NULL",expected_resolution_at:"DATETIME NULL",reporter_name:"VARCHAR(150) NULL",reporter_phone:"VARCHAR(80) NULL",reporter_role:"VARCHAR(30) NOT NULL DEFAULT 'reporter'",source_customer_id:"VARCHAR(100) NULL",source_customer_type:"VARCHAR(30) NULL",source_customer_name:"VARCHAR(150) NULL",source_package:"VARCHAR(150) NULL",source_pop:"VARCHAR(150) NULL",last_activity_at:"DATETIME NULL",import_reference:"VARCHAR(160) NULL"};
const issueTypes=[['No internet','no_internet'],['Slow speed','slow_speed'],['Billing Issue','billing'],['Line issue','line_issue'],['Others','other'],['Fiber Issue','line_issue'],['Nms down','no_internet'],['Link Down','no_internet'],['Link Fluctuation','line_issue'],['Bandwidth Slow','slow_speed'],['Package Upgrade','other','service_request'],['Package Downgrade','other','service_request'],['New Connection Query','other','enquiry'],['Client Info Change','other','service_request'],['Router Configuration','other','service_request'],['Website Access Problem','other'],['Connection Discontinue Issue','other','service_request'],['Mac Bind Issue','other'],['Device Faulty','line_issue'],['Re-Connect','other','service_request'],['Ping High, Packet Loss & Gamming Issue','slow_speed'],['Upload Speed Issue','slow_speed'],['Youtube, Facebook & BDIX Problem','other'],['Logical/Physical Installation','other','service_request'],['RF link down','no_internet'],['IPTSP-PABX','other'],['Problem','other']];
try{
 await connection.query(fs.readFileSync('database/operations.sql','utf8'));
 for(const [table,columns] of Object.entries({customers,tickets})){
  const [existing]=await connection.query(`SHOW COLUMNS FROM ${table}`);
  const missing=Object.entries(columns).filter(([name])=>!existing.some(column=>column.Field===name));
  if(missing.length)await connection.query(`ALTER TABLE ${table} `+missing.map(([name,definition])=>`ADD COLUMN ${name} ${definition}`).join(', '));
  console.log(`${table}: ${missing.length} operational columns added`);
 }
 await connection.query("ALTER TABLE customers MODIFY next_payment_date DATE NULL");
 await connection.query("ALTER TABLE tickets MODIFY customer_id INT UNSIGNED NULL, MODIFY ticket_no VARCHAR(80) NOT NULL");
 const refs={customers:[['pop_id','pops']],tickets:[['issue_type_id','issue_types'],['assigned_team_id','teams'],...['assigned_member_id','created_by_id','assigned_by_id','forwarded_by_id','resolved_by_id'].map(column=>[column,'employees'])]};
 for(const [table,columns] of Object.entries(refs))for(const [column,target] of columns){
  const name=`fk_ops_${table}_${column}`;
  const [existing]=await connection.query('SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=?',[table,name]);
  if(!existing.length)await connection.query(`ALTER TABLE ${table} ADD CONSTRAINT ${name} FOREIGN KEY (${column}) REFERENCES ${target}(id) ON DELETE SET NULL`);
 }
 for(const [name,category,kind='support'] of issueTypes)await connection.execute('INSERT IGNORE INTO issue_types(name,category,kind) VALUES(?,?,?)',[name,category,kind]);
 console.log('Operations migration complete; existing records preserved.');
}finally{await connection.end();}
