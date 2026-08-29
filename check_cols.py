import sqlalchemy
e = sqlalchemy.create_engine('postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev')
c = e.connect()
r = c.execute(sqlalchemy.text("SELECT column_name FROM information_schema.columns WHERE table_name='employees' ORDER BY ordinal_position"))
cols = [x[0] for x in r]
print(cols)
c.close()
