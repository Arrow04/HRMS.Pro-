-- ==========================================
-- POSTGRESQL ROW-LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Create a superuser role for migrations that bypasses RLS
ALTER ROLE postgres SET row_security = off;

-- RLS for users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON users;
CREATE POLICY tenant_isolation_policy ON users
    USING (
        organization_id = current_setting('app.current_tenant_id', true)::integer
        OR current_setting('app.current_tenant_id', true) IS NULL
    );

-- RLS for employees
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON employees;
CREATE POLICY tenant_isolation_policy ON employees
    USING (
        organization_id = current_setting('app.current_tenant_id', true)::integer
        OR current_setting('app.current_tenant_id', true) IS NULL
    );

-- RLS for companies
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON companies;
CREATE POLICY tenant_isolation_policy ON companies
    USING (
        organization_id = current_setting('app.current_tenant_id', true)::integer
        OR current_setting('app.current_tenant_id', true) IS NULL
    );

-- RLS for departments
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON departments;
CREATE POLICY tenant_isolation_policy ON departments
    USING (
        organization_id = current_setting('app.current_tenant_id', true)::integer
        OR current_setting('app.current_tenant_id', true) IS NULL
    );

-- RLS for branches
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON branches;
CREATE POLICY tenant_isolation_policy ON branches
    USING (
        organization_id = current_setting('app.current_tenant_id', true)::integer
        OR current_setting('app.current_tenant_id', true) IS NULL
    );

-- RLS for designations
ALTER TABLE designations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON designations;
CREATE POLICY tenant_isolation_policy ON designations
    USING (
        organization_id = current_setting('app.current_tenant_id', true)::integer
        OR current_setting('app.current_tenant_id', true) IS NULL
    );

-- RLS for leave_applications
ALTER TABLE leave_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON leave_applications;
CREATE POLICY tenant_isolation_policy ON leave_applications
    USING (
        organization_id = current_setting('app.current_tenant_id', true)::integer
        OR current_setting('app.current_tenant_id', true) IS NULL
    );

-- RLS for attendances
ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON attendances;
CREATE POLICY tenant_isolation_policy ON attendances
    USING (
        organization_id = current_setting('app.current_tenant_id', true)::integer
        OR current_setting('app.current_tenant_id', true) IS NULL
    );

-- RLS for payrolls
ALTER TABLE payrolls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON payrolls;
CREATE POLICY tenant_isolation_policy ON payrolls
    USING (
        organization_id = current_setting('app.current_tenant_id', true)::integer
        OR current_setting('app.current_tenant_id', true) IS NULL
    );

-- RLS for expenses
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON expenses;
CREATE POLICY tenant_isolation_policy ON expenses
    USING (
        organization_id = current_setting('app.current_tenant_id', true)::integer
        OR current_setting('app.current_tenant_id', true) IS NULL
    );

-- RLS for holidays
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON holidays;
CREATE POLICY tenant_isolation_policy ON holidays
    USING (
        organization_id = current_setting('app.current_tenant_id', true)::integer
        OR current_setting('app.current_tenant_id', true) IS NULL
    );

-- RLS for job_openings
ALTER TABLE job_openings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON job_openings;
CREATE POLICY tenant_isolation_policy ON job_openings
    USING (
        organization_id = current_setting('app.current_tenant_id', true)::integer
        OR current_setting('app.current_tenant_id', true) IS NULL
    );

-- RLS for candidates
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON candidates;
CREATE POLICY tenant_isolation_policy ON candidates
    USING (
        organization_id = current_setting('app.current_tenant_id', true)::integer
        OR current_setting('app.current_tenant_id', true) IS NULL
    );

-- RLS for interviews
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON interviews;
CREATE POLICY tenant_isolation_policy ON interviews
    USING (
        organization_id = current_setting('app.current_tenant_id', true)::integer
        OR current_setting('app.current_tenant_id', true) IS NULL
    );

-- RLS for performance_reviews
ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON performance_reviews;
CREATE POLICY tenant_isolation_policy ON performance_reviews
    USING (
        organization_id = current_setting('app.current_tenant_id', true)::integer
        OR current_setting('app.current_tenant_id', true) IS NULL
    );

-- RLS for goals
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON goals;
CREATE POLICY tenant_isolation_policy ON goals
    USING (
        organization_id = current_setting('app.current_tenant_id', true)::integer
        OR current_setting('app.current_tenant_id', true) IS NULL
    );

-- RLS for feedback
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON feedback;
CREATE POLICY tenant_isolation_policy ON feedback
    USING (
        organization_id = current_setting('app.current_tenant_id', true)::integer
        OR current_setting('app.current_tenant_id', true) IS NULL
    );

-- RLS for system_health_logs
ALTER TABLE system_health_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON system_health_logs;
CREATE POLICY tenant_isolation_policy ON system_health_logs
    USING (
        organization_id = current_setting('app.current_tenant_id', true)::integer
        OR current_setting('app.current_tenant_id', true) IS NULL
    );

-- Force RLS for all tables (optional, uncomment if needed)