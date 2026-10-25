CREATE DATABASE IF NOT EXISTS isp_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE isp_system;

CREATE TABLE packages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  speed_mbps INT UNSIGNED NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  unlimited BOOLEAN NOT NULL DEFAULT TRUE,
  service_hours TINYINT UNSIGNED NOT NULL DEFAULT 24,
  connection_type VARCHAR(30) NOT NULL DEFAULT 'fiber_optics',
  public_ip_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  otc_charge DECIMAL(10,2) NOT NULL DEFAULT 0,
  support_hours VARCHAR(60) NOT NULL DEFAULT '24/7',
  vat_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  vat_included BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cid VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(150),
  address TEXT,
  package_id INT UNSIGNED NOT NULL,
  next_payment_date DATE NOT NULL,
  account_status ENUM('active','suspended','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_customer_package FOREIGN KEY (package_id) REFERENCES packages(id)
);

CREATE TABLE tickets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_no VARCHAR(30) NOT NULL UNIQUE,
  customer_id INT UNSIGNED NOT NULL,
  category ENUM('no_internet','slow_speed','billing','line_issue','other') NOT NULL,
  subject VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  status ENUM('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
  priority ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  INDEX idx_open_duplicate (customer_id, category, status),
  CONSTRAINT fk_ticket_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE TABLE ticket_notes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT UNSIGNED NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_note_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

INSERT INTO packages (name, speed_mbps, price) VALUES
('Starter', 20, 800.00), ('Family', 40, 1200.00), ('Turbo', 80, 1800.00);

INSERT INTO customers (cid, name, phone, email, address, package_id, next_payment_date, account_status) VALUES
('CID-10021', 'Arif Rahman', '01711-234567', 'arif@example.com', 'Dhanmondi, Dhaka', 2, DATE_ADD(CURDATE(), INTERVAL 9 DAY), 'active'),
('CID-10022', 'Nusrat Jahan', '01819-654321', 'nusrat@example.com', 'Uttara, Dhaka', 3, DATE_ADD(CURDATE(), INTERVAL 3 DAY), 'active'),
('CID-10023', 'Hasan Ali', '01912-112233', NULL, 'Mirpur, Dhaka', 1, DATE_SUB(CURDATE(), INTERVAL 2 DAY), 'suspended');

INSERT INTO tickets (ticket_no, customer_id, category, subject, description, status, priority)
VALUES ('TKT-240001', 1, 'slow_speed', 'Speed drops in the evening', 'Customer reports low speed after 8 PM.', 'in_progress', 'high');

INSERT INTO ticket_notes (ticket_id, note) VALUES (1, 'Initial line test completed. Escalated to network team.');
