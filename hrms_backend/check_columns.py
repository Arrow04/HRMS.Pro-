from database import engine
from sqlalchemy import text

tables = ['assets', 'salary_revisions', 'salary_loans', 'notifications', 
          'investment_declarations', 'onboarding_tasks', 'anomaly_alerts', 
          'employee_lifecycle_events']

with engine.connect() as conn:
    for t in tables:
        r = conn.execute(
            text("SELECT column_name FROM information_schema.columns WHERE table_name=:t AND column_name='company_id'"),
            {'t': t}
        ).fetchone()
        print(f'{t}: {"YES" if r else "NO"}')
