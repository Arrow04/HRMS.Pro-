import sqlalchemy
e = sqlalchemy.create_engine('postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev')
c = e.connect()
r = c.execute(sqlalchemy.text("SELECT id, first_name, last_name, email, employee_code FROM employees WHERE first_name ILIKE '%tirna%' OR first_name ILIKE '%sayak%' OR last_name ILIKE '%banerjee%' OR last_name ILIKE '%chattopadhyay%'"))
for row in r:
    print(row)
c.close()
