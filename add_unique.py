import sqlalchemy
e = sqlalchemy.create_engine('postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev')
c = e.connect()
try:
    c.execute(sqlalchemy.text("ALTER TABLE employees ADD CONSTRAINT uq_employees_email UNIQUE (email)"))
    c.commit()
    print("Added unique constraint on employees.email")
except Exception as ex:
    c.rollback()
    if 'already exists' in str(ex):
        print("Unique constraint already exists")
    else:
        print(f"Error: {ex}")
c.close()
