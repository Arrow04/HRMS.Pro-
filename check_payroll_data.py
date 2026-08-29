import sqlalchemy

e = sqlalchemy.create_engine('postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev')
c = e.connect()

# Check employee salary data
r = c.execute(sqlalchemy.text("SELECT COUNT(*) FROM employees WHERE base_salary > 0"))
print(f"Employees with salary > 0: {r.scalar()}")

r = c.execute(sqlalchemy.text("SELECT COUNT(*) FROM employees WHERE base_salary = 0 OR base_salary IS NULL"))
print(f"Employees with salary 0/null: {r.scalar()}")

r = c.execute(sqlalchemy.text("SELECT id, first_name, base_salary FROM employees WHERE base_salary > 0 LIMIT 5"))
print("\nSample employees with salary:")
for row in r:
    print(f"  {row[0]}: {row[1]} = {row[2]}")

# Check salary components
r = c.execute(sqlalchemy.text("SELECT COUNT(*) FROM salary_templates"))
print(f"\nSalary templates: {r.scalar()}")

r = c.execute(sqlalchemy.text("SELECT COUNT(*) FROM payroll_policies"))
print(f"Payroll policies: {r.scalar()}")

r = c.execute(sqlalchemy.text("SELECT COUNT(*) FROM attendance_policies"))
print(f"Attendance policies: {r.scalar()}")

# Check attendance stats
r = c.execute(sqlalchemy.text("SELECT COUNT(*) FROM attendances"))
print(f"\nTotal attendance records: {r.scalar()}")

r = c.execute(sqlalchemy.text("SELECT COUNT(DISTINCT employee_id) FROM attendances"))
print(f"Employees with attendance: {r.scalar()}")

c.close()
