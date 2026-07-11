-- ==========================================
-- ASSET TRACK — SUPABASE POSTGRESQL SCHEMA
-- ==========================================

-- 1. Create companies table
CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    certified_designations TEXT[] DEFAULT ARRAY['HOD', 'CEO', 'CFO', 'COO', 'Chairperson', 'President', 'Director', 'VP']::TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Create employees table
CREATE TABLE IF NOT EXISTS employees (
    office_id VARCHAR(100) PRIMARY KEY,
    admin_id VARCHAR(100) UNIQUE,
    name VARCHAR(255) NOT NULL,
    post VARCHAR(255) NOT NULL,
    company_id INT REFERENCES companies(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    personal_phone VARCHAR(50),
    official_phone VARCHAR(50),
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user' NOT NULL,
    is_blocked BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Create items table
CREATE TABLE IF NOT EXISTS items (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    quantity INT DEFAULT 1 NOT NULL,
    barcode VARCHAR(100) UNIQUE NOT NULL,
    department VARCHAR(255),
    location VARCHAR(255),
    notes TEXT,
    status VARCHAR(50) DEFAULT 'in' NOT NULL,
    assigned_to VARCHAR(255),
    visible_to_users BOOLEAN DEFAULT TRUE NOT NULL,
    company_id INT REFERENCES companies(id) ON DELETE CASCADE,
    checked_out_at TIMESTAMP WITH TIME ZONE,
    expiration_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. Create activity_log table
CREATE TABLE IF NOT EXISTS activity_log (
    id VARCHAR(100) PRIMARY KEY,
    action VARCHAR(50) NOT NULL,
    item_id VARCHAR(100),
    item_name VARCHAR(255),
    by_name VARCHAR(255) NOT NULL,
    ts BIGINT NOT NULL,
    note TEXT,
    company_id INT REFERENCES companies(id) ON DELETE CASCADE
);

-- 5. Create employee_directory (whitelist table)
CREATE TABLE IF NOT EXISTS employee_directory (
    id VARCHAR(100) PRIMARY KEY,
    company_id INT REFERENCES companies(id) ON DELETE CASCADE,
    office_id VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    designation VARCHAR(255) NOT NULL,
    official_phone VARCHAR(50) NOT NULL,
    personal_phone VARCHAR(50),
    email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE (company_id, office_id)
);

-- 6. Insert Default Companies (Google, Microsoft, Cara, ZynEra)
INSERT INTO companies (name, certified_designations) 
VALUES 
('Google', ARRAY['HOD', 'CEO', 'CFO', 'COO', 'Chairperson', 'President', 'Director', 'VP']),
('Microsoft', ARRAY['HOD', 'CEO', 'CFO', 'COO', 'Chairperson', 'President', 'Director', 'VP']),
('Cara', ARRAY['HOD', 'CEO', 'CFO', 'COO', 'Chairperson', 'President', 'Director', 'VP']),
('ZynEra', ARRAY['HOD', 'CEO', 'CFO', 'COO', 'Chairperson', 'President', 'Director', 'VP'])
ON CONFLICT (name) DO NOTHING;

-- Disable Row Level Security (RLS) to allow public access via the Anon Key
ALTER TABLE companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE employees DISABLE ROW LEVEL SECURITY;
ALTER TABLE items DISABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE employee_directory DISABLE ROW LEVEL SECURITY;
