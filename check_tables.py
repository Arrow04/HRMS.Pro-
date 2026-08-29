import sqlalchemy
e = sqlalchemy.create_engine('postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev')
c = e.connect()
for tbl in ['companies', 'departments', 'designations', 'branches']:
    r = c.execute(sqlalchemy.text(f"SELECT COUNT(*) FROM {tbl}"))
    count = r.scalar()
    print(f"{tbl}: {count} rows")
c.close()
