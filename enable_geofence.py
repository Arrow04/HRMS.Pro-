import sqlalchemy

e = sqlalchemy.create_engine('postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev')
c = e.connect()

# Enable geofence for admin employee
c.execute(sqlalchemy.text("UPDATE employees SET geofence_enabled = true WHERE id = 1723"))
c.commit()
print("Enabled geofence for employee 1723")

# Check current geofence setting
r = c.execute(sqlalchemy.text("SELECT id, geofence_enabled FROM employees WHERE id = 1723"))
row = r.fetchone()
print(f"Employee {row[0]}: geofence_enabled = {row[1]}")

c.close()
