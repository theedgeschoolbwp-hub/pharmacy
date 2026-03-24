-- =============================================================================
-- PHARMACARE POS — SAMPLE DATA SEED
-- Run AFTER schema.sql has been executed.
-- Assumes shop_id = 1 (the PharmaCare shop from schema seed).
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM shops WHERE id = 1) THEN
    RAISE EXCEPTION 'Shop id=1 not found. Run schema.sql first.';
  END IF;
END $$;

-- =============================================================================
-- SUPPLIERS
-- =============================================================================
INSERT INTO suppliers (shop_id, name, company, phone, email, address, balance, is_active) VALUES
(1, 'Ahmed Raza',   'MediTech Pharma',    '0321-1112233', 'ahmed@meditech.pk',   'Karachi Industrial Area', 15000, true),
(1, 'Sara Khan',    'PharmaPlus Dist.',   '0333-4445566', 'sara@pharmaplus.pk',  'Lahore Cantt.',            8500, true),
(1, 'Usman Ali',    'National Medicines', '0300-7778899', 'usman@natmed.pk',     'Islamabad F-10',              0, true),
(1, 'Fatima Malik', 'ZealPharma',         '0345-2223344', 'fatima@zeal.pk',      'Rawalpindi Saddar',        3200, true)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- CUSTOMERS (credit accounts)
-- =============================================================================
INSERT INTO customers (shop_id, name, phone, email, address, balance, is_active) VALUES
(1, 'Muhammad Bilal',   '0300-1234567', 'bilal@email.com',  'House 5, Gulshan',       2500, true),
(1, 'Ayesha Siddiqui',  '0321-9876543', 'ayesha@email.com', 'Flat 2B, DHA Phase 4',   1200, true),
(1, 'Dr. Imran Qureshi','0333-4567890', 'imran@clinic.pk',  'Qureshi Clinic, Bazaar',  500, true),
(1, 'Nadia Hussain',    '0345-6543210', NULL,               'Sector G-9/2, Islamabad',   0, true),
(1, 'Tariq Mehmood',    '0312-3456789', NULL,               'Mohallah Siddiqabad',     3800, true)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- EMPLOYEES
-- =============================================================================
INSERT INTO employees (shop_id, name, role, phone, salary, join_date, is_active) VALUES
(1, 'Ali Hassan',    'Pharmacist',    '0300-1111111', 45000, '2024-01-15', true),
(1, 'Sana Tariq',    'Cashier',       '0321-2222222', 28000, '2024-03-01', true),
(1, 'Kamran Bashir', 'Store Manager', '0333-3333333', 55000, '2023-11-10', true),
(1, 'Rabia Noor',    'Sales Staff',   '0345-4444444', 25000, '2024-06-01', true)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- PRODUCTS (medicines)
-- =============================================================================
INSERT INTO products (shop_id, name, generic_name, barcode, category, unit, cost_price, sale_price, requires_prescription, shelf_location, manufacturer, is_active) VALUES
(1, 'Panadol 500mg',     'Paracetamol',         'PAN500', 'Analgesic / Pain Relief',     'tablet',  8.00, 12.00, false, 'A-1', 'GSK Pakistan',          true),
(1, 'Augmentin 625mg',   'Amoxicillin+Clav.',   'AUG625', 'Antibiotic',                  'tablet', 85.00,120.00, true,  'B-2', 'GSK Pakistan',          true),
(1, 'Brufen 400mg',      'Ibuprofen',           'BRF400', 'Analgesic / Pain Relief',     'tablet',  6.00, 10.00, false, 'A-1', 'Abbott Pakistan',       true),
(1, 'Risek 20mg',        'Omeprazole',          'RSK020', 'Antacid / GI',                'capsule',18.00, 28.00, false, 'A-2', 'Getz Pharma',           true),
(1, 'ORS Sachet Orange', 'ORS',                 'ORS001', 'ORS / Electrolyte',           'sachet', 15.00, 25.00, false, 'C-1', 'National Foods Pharma', true),
(1, 'Zithromax 250mg',   'Azithromycin',        'ZTH250', 'Antibiotic',                  'capsule',60.00, 90.00, true,  'B-3', 'Pfizer Pakistan',       true),
(1, 'Glucophage 500mg',  'Metformin',           'GLP500', 'Diabetes / Antidiabetic',     'tablet', 12.00, 18.00, true,  'D-1', 'Merck Serono',          true),
(1, 'Ventolin Inhaler',  'Salbutamol',          'VEN100', 'Respiratory / Bronchodilator','inhaler',320.00,450.00, true,  'D-4', 'GSK Pakistan',          true),
(1, 'Disprin 300mg',     'Aspirin',             'DSP300', 'Analgesic / Pain Relief',     'tablet',  4.00,  7.00, false, 'A-1', 'Reckitt Benckiser',     true),
(1, 'Flagyl 400mg',      'Metronidazole',       'FLG400', 'Antibiotic',                  'tablet',  9.00, 15.00, true,  'B-1', 'Sanofi Pakistan',       true),
(1, 'Vitamin C 500mg',   'Ascorbic Acid',       'VTC500', 'Vitamin / Supplement',        'tablet',  5.00,  9.00, false, 'C-3', 'Herbion Pakistan',      true),
(1, 'Nexium 40mg',       'Esomeprazole',        'NXM040', 'Antacid / GI',                'capsule',55.00, 80.00, true,  'A-2', 'AstraZeneca',           true),
(1, 'Calpol 120mg Syrup','Paracetamol',         'CPL120', 'Analgesic / Pain Relief',     'syrup',  95.00,135.00, false, 'A-3', 'GSK Pakistan',          true),
(1, 'Zinat 500mg',       'Cefuroxime',          'ZNT500', 'Antibiotic',                  'tablet', 70.00,100.00, true,  'B-2', 'GSK Pakistan',          true),
(1, 'B-Complex Syrup',   'Vitamin B Complex',   'BCX001', 'Vitamin / Supplement',        'syrup',  65.00, 95.00, false, 'C-3', 'Sami Pharmaceuticals',  true)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- PRODUCT BATCHES (FIFO stock)
-- =============================================================================
INSERT INTO product_batches (shop_id, product_id, batch_number, expiry_date, quantity_remaining, purchase_price, sale_price) VALUES
-- Panadol (2 batches — older expiry first for FIFO testing)
(1,(SELECT id FROM products WHERE barcode='PAN500' LIMIT 1),'PN-2024-01','2025-06-30',  50,  8.00, 12.00),
(1,(SELECT id FROM products WHERE barcode='PAN500' LIMIT 1),'PN-2024-02','2026-03-31', 200,  8.00, 12.00),
-- Augmentin
(1,(SELECT id FROM products WHERE barcode='AUG625' LIMIT 1),'AU-2024-01','2025-12-31',  30, 85.00,120.00),
(1,(SELECT id FROM products WHERE barcode='AUG625' LIMIT 1),'AU-2025-01','2026-09-30', 120, 85.00,120.00),
-- Brufen
(1,(SELECT id FROM products WHERE barcode='BRF400' LIMIT 1),'BR-2024-01','2026-01-31',  80,  6.00, 10.00),
-- Risek
(1,(SELECT id FROM products WHERE barcode='RSK020' LIMIT 1),'RS-2025-01','2026-08-31', 100, 18.00, 28.00),
-- ORS — 1 near-expiry batch
(1,(SELECT id FROM products WHERE barcode='ORS001' LIMIT 1),'OR-2024-01','2025-09-30',  20, 15.00, 25.00),
(1,(SELECT id FROM products WHERE barcode='ORS001' LIMIT 1),'OR-2025-01','2027-01-31', 150, 15.00, 25.00),
-- Zithromax
(1,(SELECT id FROM products WHERE barcode='ZTH250' LIMIT 1),'ZT-2025-01','2026-12-31',  60, 60.00, 90.00),
-- Glucophage
(1,(SELECT id FROM products WHERE barcode='GLP500' LIMIT 1),'GL-2025-01','2027-03-31', 200, 12.00, 18.00),
-- Ventolin — low stock + near-expiry
(1,(SELECT id FROM products WHERE barcode='VEN100' LIMIT 1),'VE-2024-01','2025-08-31',   5,320.00,450.00),
(1,(SELECT id FROM products WHERE barcode='VEN100' LIMIT 1),'VE-2025-01','2026-06-30',  25,320.00,450.00),
-- Disprin
(1,(SELECT id FROM products WHERE barcode='DSP300' LIMIT 1),'DP-2025-01','2027-06-30', 300,  4.00,  7.00),
-- Flagyl
(1,(SELECT id FROM products WHERE barcode='FLG400' LIMIT 1),'FL-2025-01','2026-10-31',  80,  9.00, 15.00),
-- Vitamin C
(1,(SELECT id FROM products WHERE barcode='VTC500' LIMIT 1),'VC-2025-01','2027-12-31', 500,  5.00,  9.00),
-- Nexium
(1,(SELECT id FROM products WHERE barcode='NXM040' LIMIT 1),'NX-2025-01','2026-07-31',  45, 55.00, 80.00),
-- Calpol Syrup
(1,(SELECT id FROM products WHERE barcode='CPL120' LIMIT 1),'CP-2025-01','2026-05-31',  35, 95.00,135.00),
-- Zinat
(1,(SELECT id FROM products WHERE barcode='ZNT500' LIMIT 1),'ZN-2025-01','2027-02-28',  50, 70.00,100.00),
-- B-Complex
(1,(SELECT id FROM products WHERE barcode='BCX001' LIMIT 1),'BC-2025-01','2026-11-30',  60, 65.00, 95.00),
-- Expired batch (for expiry alert testing)
(1,(SELECT id FROM products WHERE barcode='RSK020' LIMIT 1),'RS-2023-01','2024-12-31',   8, 17.00, 26.00)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- PURCHASES
-- =============================================================================
INSERT INTO purchases (shop_id, supplier_id, invoice_number, total_amount, paid_amount, payment_type, status, note) VALUES
(1,(SELECT id FROM suppliers WHERE company='MediTech Pharma'    LIMIT 1),'INV-2025-001',42000,42000,'cash',        'received','Monthly stock replenishment'),
(1,(SELECT id FROM suppliers WHERE company='PharmaPlus Dist.'   LIMIT 1),'INV-2025-002',18500,10000,'credit',      'received','Partial — balance due'),
(1,(SELECT id FROM suppliers WHERE company='National Medicines'  LIMIT 1),'INV-2025-003',31200,31200,'bank_transfer','received','Antibiotics + vitamins'),
(1,(SELECT id FROM suppliers WHERE company='ZealPharma'          LIMIT 1),'INV-2025-004', 9600, 6400,'credit',      'received',NULL)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- SALES (invoices — mix of cash, credit, partial)
-- =============================================================================
INSERT INTO sales (shop_id, customer_id, subtotal, discount, total_amount, paid_amount, payment_type, prescription_ref, served_by, created_at) VALUES
(1, NULL,                                                                       245,  0, 245, 245, 'cash',    NULL,      (SELECT id FROM users WHERE username='admin' LIMIT 1), NOW()-INTERVAL '6 days'),
(1, NULL,                                                                       580, 30, 550, 550, 'cash',    NULL,      (SELECT id FROM users WHERE username='admin' LIMIT 1), NOW()-INTERVAL '5 days'),
(1, NULL,                                                                       135,  0, 135, 135, 'cash',    NULL,      (SELECT id FROM users WHERE username='admin' LIMIT 1), NOW()-INTERVAL '5 days'),
(1,(SELECT id FROM customers WHERE name='Muhammad Bilal'   LIMIT 1),           1200, 0,1200,   0, 'credit',  'RX-001',  (SELECT id FROM users WHERE username='admin' LIMIT 1), NOW()-INTERVAL '4 days'),
(1,(SELECT id FROM customers WHERE name='Ayesha Siddiqui'  LIMIT 1),            450, 0, 450, 200, 'partial', NULL,      (SELECT id FROM users WHERE username='admin' LIMIT 1), NOW()-INTERVAL '3 days'),
(1, NULL,                                                                       840, 40, 800, 800, 'cash',    NULL,      (SELECT id FROM users WHERE username='admin' LIMIT 1), NOW()-INTERVAL '1 day'),
(1, NULL,                                                                       360,  0, 360, 360, 'cash',    NULL,      (SELECT id FROM users WHERE username='admin' LIMIT 1), NOW()-INTERVAL '1 day'),
(1,(SELECT id FROM customers WHERE name='Dr. Imran Qureshi' LIMIT 1),           500, 0, 500,   0, 'credit',  'RX-002',  (SELECT id FROM users WHERE username='admin' LIMIT 1), NOW()),
(1,(SELECT id FROM customers WHERE name='Tariq Mehmood'     LIMIT 1),          3800, 0,3800,   0, 'credit',  'RX-003',  (SELECT id FROM users WHERE username='admin' LIMIT 1), NOW()-INTERVAL '2 days')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- CUSTOMER PAYMENTS
-- =============================================================================
INSERT INTO customer_payments (shop_id, customer_id, amount, payment_type, note, created_at) VALUES
(1,(SELECT id FROM customers WHERE name='Muhammad Bilal'  LIMIT 1),  500,'cash','Partial settlement',     NOW()-INTERVAL '2 days'),
(1,(SELECT id FROM customers WHERE name='Ayesha Siddiqui' LIMIT 1),  250,'cash','Remaining balance paid', NOW()-INTERVAL '1 day')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- EXPENSES
-- =============================================================================
INSERT INTO expenses (shop_id, category, amount, description, date) VALUES
(1,'Rent',        35000,'Monthly shop rent — March 2026',     CURRENT_DATE - 25),
(1,'Electricity',  4200,'WAPDA bill — February 2026',          CURRENT_DATE - 20),
(1,'Salaries',   153000,'Staff salaries — February 2026',      CURRENT_DATE - 15),
(1,'Supplies',     1800,'Paper bags, staples, receipt rolls',  CURRENT_DATE - 10),
(1,'Maintenance',  2500,'AC servicing',                         CURRENT_DATE - 8),
(1,'Internet',     2200,'Monthly internet bill',               CURRENT_DATE - 5),
(1,'Miscellaneous', 800,'Cleaning supplies',                   CURRENT_DATE - 2)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- EMPLOYEE SALARY PAYMENTS
-- =============================================================================
INSERT INTO employee_payments (shop_id, employee_id, amount, month, note) VALUES
(1,(SELECT id FROM employees WHERE name='Ali Hassan'     LIMIT 1),45000,'2026-02','Full salary Feb 2026'),
(1,(SELECT id FROM employees WHERE name='Sana Tariq'     LIMIT 1),28000,'2026-02','Full salary Feb 2026'),
(1,(SELECT id FROM employees WHERE name='Kamran Bashir'  LIMIT 1),55000,'2026-02','Full salary Feb 2026'),
(1,(SELECT id FROM employees WHERE name='Rabia Noor'     LIMIT 1),25000,'2026-02','Full salary Feb 2026')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Done! Sample data loaded.
--   4 suppliers | 5 customers (3 with balances) | 4 employees
--   15 medicines | 20 FIFO batches (incl. near-expiry + expired + low stock)
--   4 purchases | 9 sales (cash/credit/partial) | 2 customer payments
--   7 expenses | 4 salary payments
-- =============================================================================
