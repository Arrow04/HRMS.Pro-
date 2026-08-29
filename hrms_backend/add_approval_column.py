from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE exit_records ADD COLUMN approval_status VARCHAR(50) DEFAULT 'pending'"))
        conn.commit()
        print("Column added successfully")
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
