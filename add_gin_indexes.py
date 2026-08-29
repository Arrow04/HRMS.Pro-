import sqlalchemy

e = sqlalchemy.create_engine('postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev')
c = e.connect()

# Try creating pg_trgm with proper syntax
try:
    c.execute(sqlalchemy.text("CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public"))
    c.commit()
    print("pg_trgm extension created")
except Exception as ex:
    c.rollback()
    print(f"pg_trgm: {ex}")

# Now try GIN indexes
gin_indexes = [
    "CREATE INDEX IF NOT EXISTS idx_emp_search_name ON employees USING gin (first_name gin_trgm_ops)",
    "CREATE INDEX IF NOT EXISTS idx_emp_search_email ON employees USING gin (email gin_trgm_ops)",
    "CREATE INDEX IF NOT EXISTS idx_emp_search_code ON employees USING gin (employee_code gin_trgm_ops)",
]

for idx_sql in gin_indexes:
    try:
        c.execute(sqlalchemy.text(idx_sql))
        c.commit()
        print(f"  Created GIN index")
    except Exception as ex:
        c.rollback()
        # Fallback to B-tree
        tbl = idx_sql.split("ON ")[1].split(" ")[0]
        col = idx_sql.split("ON employees USING gin (")[1].split(" gin")[0]
        btree_sql = f"CREATE INDEX IF NOT EXISTS idx_{tbl}_{col}_btree ON {tbl} ({col})"
        try:
            c.execute(sqlalchemy.text(btree_sql))
            c.commit()
            print(f"  Created B-tree fallback for {col}")
        except:
            c.rollback()

c.close()
print("Done!")
