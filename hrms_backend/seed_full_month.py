"""Seed one full month of comprehensive test data across ALL modules.

Creates 3 companies, branches, departments, designations, leave types, holidays,
a full month of attendance for every employee, leaves, expenses, payroll,
recruitment (jobs/candidates/interviews), performance reviews, goals, assets,
notifications, activity logs, and a subscription/plan. Safe to re-run.
"""
import random
from datetime import datetime, date, timedelta
from sqlalchemy import create_engine, text

engine = create_engine("postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev")
random.seed(42)

ORG_ID = 1
NOW = datetime.utcnow()
TODAY = NOW.date()
# Use the PREVIOUS month as the "seed month" so it's a complete month
first_of_month = TODAY.replace(day=1)
MONTH_END = first_of_month - timedelta(days=1)
SEED_MONTH = MONTH_END.month
SEED_YEAR = MONTH_END.year
DAYS_IN_MONTH = MONTH_END.day
MONTH_START = MONTH_END.replace(day=1)

def q(sql, **params):
    with engine.connect() as c:
        return c.execute(text(sql), params).fetchall()

def exe(sql, **params):
    with engine.begin() as c:
        r = c.execute(text(sql), params)
        return r.lastrowid if r.lastrowid else None

def exe_return(sql, **params):
    with engine.begin() as c:
        r = c.execute(text(sql + " RETURNING id"), params)
        return r.fetchone()[0]

print(f"Seeding month: {SEED_MONTH}/{SEED_YEAR} ({DAYS_IN_MONTH} days)")

# ============ 1. COMPANIES (3) ============
company_data = [
    ("Acme Corporation", "ACME", "IT Services", "Software development & IT services", 5),
    ("Globex Retail", "GLBX", "Retail", "Retail & e-commerce operations", 6),
    ("Initech Finance", "INIT", "Finance", "Financial services & consulting", 5),
]
company_ids = []
for name, code, industry, desc, wk in company_data:
    row = q("SELECT id FROM companies WHERE organization_id=:o AND code=:c", o=ORG_ID, c=code)
    if row:
        company_ids.append(row[0][0])
    else:
        cid = exe_return(
            "INSERT INTO companies (name, code, description, industry, company_size, address, email, phone, organization_id, status) "
            "VALUES (:n,:c,:d,:i,'51-200','Bangalore, India',:e,'+91 0000000000',:o,'active')",
            n=name, c=code, d=desc, i=industry, e=f"info@{code.lower()}.com", o=ORG_ID)
        company_ids.append(cid)
        print(f"  + Company {name} ({code}) id={cid}")
print(f"Companies: {len(company_ids)}")

# ============ 2. BRANCHES ============
branch_ids = []
for i, cid in enumerate(company_ids):
    row = q("SELECT id FROM branches WHERE organization_id=:o AND code=:c", o=ORG_ID, c=f"BR{i+1}")
    if not row:
        bid = exe_return(
            "INSERT INTO branches (name, code, location, organization_id, company_id, status) "
            "VALUES (:n,:c,:l,:o,:co,'active')",
            n=["Head Office", "West Zone", "North Zone"][i], c=f"BR{i+1}", l=["Bangalore", "Mumbai", "Delhi"][i], o=ORG_ID, co=cid)
        branch_ids.append(bid)
    else:
        branch_ids.append(row[0][0])
print(f"Branches: {len(branch_ids)}")

# ============ 3. DEPARTMENTS ============
dept_data = [
    ("Engineering", "ENG"), ("Sales", "SAL"), ("Marketing", "MKT"),
    ("Finance", "FIN"), ("Human Resources", "HR"), ("Operations", "OPS"),
]
dept_ids = []
for name, code in dept_data:
    row = q("SELECT id FROM departments WHERE organization_id=:o AND code=:c", o=ORG_ID, c=code)
    if row:
        dept_ids.append(row[0][0])
    else:
        did = exe_return(
            "INSERT INTO departments (name, code, description, organization_id, status) "
            "VALUES (:n,:c,:d,:o,'active')", n=name, c=code, d=name, o=ORG_ID)
        dept_ids.append(did)
print(f"Departments: {len(dept_ids)}")

# ============ 4. DESIGNATIONS ============
desig_data = [
    ("Software Engineer", "SWE"), ("Senior Engineer", "SSE"), ("Product Manager", "PM"),
    ("Sales Executive", "SE"), ("Accountant", "ACC"), ("HR Executive", "HRX"),
    ("Operations Manager", "OPSM"), ("Marketing Specialist", "MKS"),
]
desig_ids = []
for title, code in desig_data:
    row = q("SELECT id FROM designations WHERE organization_id=:o AND code=:c", o=ORG_ID, c=code)
    if row:
        desig_ids.append(row[0][0])
    else:
        did = exe_return(
            "INSERT INTO designations (code, title, grade, description, organization_id, status) "
            "VALUES (:c,:t,'L',:d,:o,'active')", c=code, t=title, d=title, o=ORG_ID)
        desig_ids.append(did)
print(f"Designations: {len(desig_ids)}")

# ============ 5. LEAVE TYPES ============
leave_type_data = [
    ("Casual Leave", "CL", 12), ("Sick Leave", "SL", 10), ("Earned Leave", "EL", 18),
    ("Maternity Leave", "ML", 180), ("Paternity Leave", "PL", 15), ("Comp Off", "CO", 0),
]
leave_type_ids = {}
for name, code, days in leave_type_data:
    row = q("SELECT id FROM leave_types WHERE organization_id=:o AND code=:c", o=ORG_ID, c=code)
    if row:
        leave_type_ids[code] = row[0][0]
    else:
        lid = exe_return(
            "INSERT INTO leave_types (name, code, days_allowed, carry_forward, organization_id, status) "
            "VALUES (:n,:c,:d,true,:o,'active')", n=name, c=code, d=days, o=ORG_ID)
        leave_type_ids[code] = lid
print(f"Leave types: {len(leave_type_ids)}")

# ============ 6. HOLIDAYS (one per week of month + a few) ============
holidays_to_add = [
    (1, "New Year Holiday"), (14, "Republic Day"), (26, "Independence Day"),
    (2, "Foundation Day"), (19, "Diwali (observed)"),
]
for day, name in holidays_to_add:
    if day > DAYS_IN_MONTH:
        continue
    d = date(SEED_YEAR, SEED_MONTH, day)
    row = q("SELECT id FROM holidays WHERE organization_id=:o AND date=:d", o=ORG_ID, d=d)
    if not row:
        exe_return(
            "INSERT INTO holidays (name, date, description, type, organization_id, year, is_paid, is_recurring, is_working_day) "
            "VALUES (:n,:d,:desc,'public',:o,:y,true,false,false)",
            n=name, d=d, desc=f"{name} - seeded", o=ORG_ID, y=SEED_YEAR)
print(f"Holidays: {len(holidays_to_add)}")

# ============ 7. SHIFTS ============
shifts = [
    ("General Shift", "GEN", "09:00", "18:00", "0,1,2,3,4,5,6"),
    ("Morning Shift", "MORN", "06:00", "14:00", "1,2,3,4,5,6"),
    ("Night Shift", "NIGHT", "22:00", "06:00", "0,1,2,3,4,5,6"),
]
shift_ids = []
for name, code, st, et, wd in shifts:
    row = q("SELECT id FROM shifts WHERE organization_id=:o AND code=:c", o=ORG_ID, c=code)
    if row:
        shift_ids.append(row[0][0])
    else:
        sid = exe_return(
            "INSERT INTO shifts (name, code, shift_type, start_time, end_time, grace_minutes, break_duration, working_days, organization_id, status, color, created_at, updated_at) "
            "VALUES (:n,:c,'general',:st,:et,15,60,:wd,:o,'active','#3B82F6',:now,:now)",
            n=name, c=code, st=st, et=et, wd=wd, o=ORG_ID, now=NOW)
        shift_ids.append(sid)
print(f"Shifts: {len(shift_ids)}")

# ============ 8. EMPLOYEES (extend the 5 existing + create more = 12 total) ============
emp_rows = q("SELECT id, first_name, last_name, employee_code, user_id FROM employees WHERE organization_id=:o", o=ORG_ID)
existing_codes = {r[3] for r in emp_rows}
new_emp_specs = [
    ("Arjun", "Mehta", "ARJ001", "Software Engineer", "SWE", "male"),
    ("Priya", "Sharma", "PRI002", "Senior Engineer", "SSE", "female"),
    ("Rahul", "Verma", "RAH003", "Product Manager", "PM", "male"),
    ("Sneha", "Iyer", "SNE004", "Sales Executive", "SE", "female"),
    ("Vikram", "Singh", "VIK005", "Accountant", "ACC", "male"),
    ("Ananya", "Reddy", "ANA006", "HR Executive", "HRX", "female"),
    ("Karthik", "Nair", "KAR007", "Operations Manager", "OPSM", "male"),
]
emp_ids = [r[0] for r in emp_rows]
for i, (fn, ln, code, desig, dcode, gender) in enumerate(new_emp_specs):
    if code in existing_codes:
        continue
    dept = dept_ids[i % len(dept_ids)]
    comp = company_ids[i % len(company_ids)]
    desig_id = desig_ids[i % len(desig_ids)]
    join = date(SEED_YEAR - 1, max(1, SEED_MONTH - 2), 10)
    sal = random.choice([45000, 60000, 75000, 90000, 120000])
    eid = exe_return(
        "INSERT INTO employees (first_name, last_name, email, employee_code, designation, designation_id, department_id, organization_id, company_id, "
        "gender, date_of_birth, phone, join_date, base_salary, status, employment_type, bank_name, bank_account_number, ifsc_code) "
        "VALUES (:fn,:ln,:email,:code,:desig,:did,:dept,:o,:comp,:gender,:dob,:phone,:join,:sal,'active','full_time','HDFC Bank','0000000000','HDFC0000001')",
        fn=fn, ln=ln, email=f"{fn.lower()}.{ln.lower()}@hrms.com", code=code, desig=desig, did=desig_id,
        dept=dept, o=ORG_ID, comp=comp, gender=gender, dob=date(SEED_YEAR - 28, 5, 15), phone=f"+91 98{i:07d}", join=join, sal=sal)
    emp_ids.append(eid)
    print(f"  + Employee {fn} {ln} ({code}) id={eid}")

# Assign company/dept to existing employees
for i, eid in enumerate(emp_ids):
    exe("UPDATE employees SET company_id=:c, department_id=:d WHERE id=:e",
        c=company_ids[i % 3], d=dept_ids[i % len(dept_ids)], e=eid)

# Map user_id -> employee_id for notifications/leaves approvers
user_emp = {}
for r in q("SELECT id, user_id FROM employees WHERE organization_id=:o", o=ORG_ID):
    if r[1]:
        user_emp[r[1]] = r[0]

print(f"Employees total: {len(emp_ids)}")

# ============ 9. ATTENDANCE - full month for every employee ============
print("Seeding attendance for full month...")
# Holiday dates
holiday_dates = set()
for h in q("SELECT date FROM holidays WHERE organization_id=:o", o=ORG_ID):
    holiday_dates.add(h[0])

att_count = 0
status_weights = ["present"] * 70 + ["late"] * 12 + ["half_day"] * 6 + ["absent"] * 5 + ["work_from_home"] * 7
for eid in emp_ids:
    for day_offset in range(DAYS_IN_MONTH):
        d = MONTH_START + timedelta(days=day_offset)
        if d > TODAY:
            break
        exists = q("SELECT id FROM attendances WHERE employee_id=:e AND date=:d", e=eid, d=d)
        if exists:
            continue
        dow = d.weekday()  # 0=Mon..6=Sun
        is_holiday = d in holiday_dates
        status = random.choice(status_weights)
        ci = None
        co = None
        wh = 0
        is_late = False
        late_min = 0
        is_off = False
        if is_holiday:
            status = "holiday"
        elif dow >= 5:
            status = "week_off"
            is_off = True
        else:
            if status in ("present", "late", "work_from_home"):
                hour = random.choice([8, 9]) if status == "present" else random.choice([9, 10])
                minute = random.choice([0, 5, 10, 15])
                ci = datetime(d.year, d.month, d.day, hour, minute)
                co = datetime(d.year, d.month, d.day, random.choice([17, 18, 19]), random.choice([0, 15, 30]))
                wh = round((co - ci).total_seconds() / 3600, 2)
                is_late = hour >= 9 and minute >= 5
                late_min = random.randint(5, 40) if is_late else 0
            elif status == "half_day":
                ci = datetime(d.year, d.month, d.day, 9, 0)
                co = datetime(d.year, d.month, d.day, 13, 0)
                wh = 4.0
            elif status == "absent":
                ci = None
                co = None
                wh = 0
        status_col = status
        if is_off:
            status_col = "week_off"
        exe_return(
            "INSERT INTO attendances (employee_id, organization_id, company_id, department_id, shift_id, date, check_in, check_out, status, "
            "work_hours, scheduled_hours, break_hours, is_late, late_minutes, is_manual_entry, sync_status) "
            "VALUES (:e,:o,:co,:dpt,:sh,:d,:ci,:coo,:st,:wh,8,1,:il,:lm,true,'synced')",
            e=eid, o=ORG_ID, co=q("SELECT company_id FROM employees WHERE id=:e", e=eid)[0][0],
            dpt=q("SELECT department_id FROM employees WHERE id=:e", e=eid)[0][0],
            sh=shift_ids[eid % len(shift_ids)], d=d, ci=ci, coo=co, st=status_col, wh=wh, il=is_late, lm=late_min)
        att_count += 1
print(f"  Attendance records: {att_count}")

# ============ 10. LEAVE APPLICATIONS ============
print("Seeding leave applications...")
lv_count = 0
for i, eid in enumerate(emp_ids):
    for j in range(2):
        if i % 3 == 0 and j == 1:
            continue  # not everyone gets 2 leaves
        start_d = MONTH_START + timedelta(days=random.randint(3, DAYS_IN_MONTH - 4))
        dur = random.choice([1, 1, 2, 3])
        end_d = min(start_d + timedelta(days=dur - 1), MONTH_END)
        ltype = random.choice(["CL", "SL", "EL"])
        status = random.choice(["pending", "approved", "approved", "rejected", "pending"])
        exe_return(
            "INSERT INTO leave_applications (employee_id, leave_type_id, organization_id, company_id, department_id, start_date, end_date, total_days, "
            "reason, purpose, status, current_approval_level, total_approval_levels, level1_approver_id, balance_deducted, request_source) "
            "VALUES (:e,:lt,:o,:co,:dpt,:sd,:ed,:td,:reason,:purpose,:st,2,2,:appr,1,'web')",
            e=eid, lt=leave_type_ids[ltype], o=ORG_ID,
            co=q("SELECT company_id FROM employees WHERE id=:e", e=eid)[0][0],
            dpt=q("SELECT department_id FROM employees WHERE id=:e", e=eid)[0][0],
            sd=start_d, ed=end_d, td=(end_d - start_d).days + 1,
            reason=f"{ltype} for personal reasons", purpose=random.choice(["personal", "medical", "family", "emergency"]),
            st=status, appr=1)
        lv_count += 1
print(f"  Leave applications: {lv_count}")

# ============ 11. EXPENSES ============
print("Seeding expenses...")
exp_count = 0
exp_categories = [
    ("Travel", random.uniform(1000, 25000)), ("Food", random.uniform(200, 3000)),
    ("Accommodation", random.uniform(3000, 40000)), ("Office Supplies", random.uniform(100, 5000)),
    ("Client Entertainment", random.uniform(500, 15000)), ("Fuel", random.uniform(300, 8000)),
]
for i, eid in enumerate(emp_ids):
    for j in range(3):
        cat, amt = random.choice(exp_categories)
        d = MONTH_START + timedelta(days=random.randint(1, DAYS_IN_MONTH))
        if d > TODAY:
            break
        status = random.choice(["pending", "approved", "approved", "reimbursed", "rejected"])
        exe_return(
            "INSERT INTO expenses (employee_id, category, amount, currency, description, expense_date, status, organization_id, company_id, department_id, payment_method) "
            "VALUES (:e,:cat,:amt,'INR',:desc,:d,:st,:o,:co,:dpt,'bank_transfer')",
            e=eid, cat=cat, amt=round(amt, 2), desc=f"{cat} expense - month {SEED_MONTH}",
            d=d, st=status, o=ORG_ID,
            co=q("SELECT company_id FROM employees WHERE id=:e", e=eid)[0][0],
            dpt=q("SELECT department_id FROM employees WHERE id=:e", e=eid)[0][0])
        exp_count += 1
print(f"  Expenses: {exp_count}")

# ============ 12. PAYROLL ============
print("Seeding payroll...")
pay_count = 0
for eid in emp_ids:
    exists = q("SELECT id FROM payrolls WHERE employee_id=:e AND month=:m AND year=:y", e=eid, m=SEED_MONTH, y=SEED_YEAR)
    if exists:
        continue
    emp = q("SELECT company_id, department_id, base_salary FROM employees WHERE id=:e", e=eid)[0]
    base = float(emp[2]) or random.choice([40000, 55000, 70000, 95000])
    hra = round(base * 0.4, 2)
    da = round(base * 0.1, 2)
    conv = 1600
    med = 1250
    spec = round(base * 0.2, 2)
    gross = round(base + hra + da + conv + med + spec, 2)
    pf = round(min(base * 0.12, 1800), 2)
    pt = 200
    tds = round(gross * 0.05, 2)
    net = round(gross - pf - pt - tds, 2)
    present = q("SELECT count(*) FROM attendances WHERE employee_id=:e AND date >= :s AND date <= :en AND status IN ('present','late','work_from_home')",
                e=eid, s=MONTH_START, en=MONTH_END)[0][0]
    absent = q("SELECT count(*) FROM attendances WHERE employee_id=:e AND date >= :s AND date <= :en AND status='absent'",
               e=eid, s=MONTH_START, en=MONTH_END)[0][0]
    on_leave = q("SELECT count(*) FROM attendances WHERE employee_id=:e AND date >= :s AND date <= :en AND status='on_leave'",
                 e=eid, s=MONTH_START, en=MONTH_END)[0][0]
    exe_return(
        "INSERT INTO payrolls (employee_id, month, year, company_id, organization_id, department_id, basic_salary, hra, da, conveyance, medical, "
        "special_allowance, gross_salary, pf_deduction, professional_tax, tds_deduction, net_salary, working_days, present_days, absent_days, "
        "paid_days, leave_days, status, payment_method) "
        "VALUES (:e,:m,:y,:co,:o,:dpt,:base,:hra,:da,:conv,:med,:spec,:gross,:pf,:pt,:tds,:net,:wd,:pd,:ad,:paidd,:ld,'processed','bank_transfer')",
        e=eid, m=SEED_MONTH, y=SEED_YEAR, co=emp[0], o=ORG_ID, dpt=emp[1], base=base, hra=hra, da=da, conv=conv, med=med, spec=spec,
        gross=gross, pf=pf, pt=pt, tds=tds, net=net, wd=DAYS_IN_MONTH, pd=present, ad=absent, paidd=present, ld=on_leave)
    pay_count += 1
print(f"  Payroll records: {pay_count}")

# ============ 13. SALARY TEMPLATES ============
st_count = 0
for name, bp, hp, sp, op in [
    ("Standard Engineering", 50, 20, 15, 15),
    ("Sales Incentive Plan", 40, 20, 25, 15),
    ("Executive Compensation", 55, 25, 10, 10),
]:
    if not q("SELECT id FROM salary_templates WHERE organization_id=:o AND name=:n", o=ORG_ID, n=name):
        exe_return("INSERT INTO salary_templates (name, basic_percent, hra_percent, special_allowance_percent, other_allowance_percent, organization_id, status) "
                   "VALUES (:n,:bp,:hp,:sp,:op,:o,'active')", n=name, bp=bp, hp=hp, sp=sp, op=op, o=ORG_ID)
        st_count += 1
print(f"  Salary templates: {st_count}")

# ============ 14. RECRUITMENT ============
print("Seeding recruitment...")
job_count = 0
cand_count = 0
int_count = 0
jobs = [
    ("Senior React Developer", "Frontend", 90000, 150000),
    ("Backend Python Engineer", "Engineering", 80000, 130000),
    ("Sales Manager", "Sales", 60000, 100000),
    ("HR Business Partner", "HR", 50000, 90000),
]
job_ids = []
for i, (title, dept, s_min, s_max) in enumerate(jobs):
    if not q("SELECT id FROM job_openings WHERE organization_id=:o AND title=:t", o=ORG_ID, t=title):
        jid = exe_return(
            "INSERT INTO job_openings (title, description, requirements, location, organization_id, company_id, department_id, employment_type, "
            "salary_min, salary_max, experience_required, vacancy_count, expiry_date, published_date, status) "
            "VALUES (:t,:desc,:req,'Bangalore',:o,:co,:dpt,'full_time',:smin,:smax,'3-5 years',2,:exp,:pub,'open')",
            t=title, desc=f"{title} position", req="Relevant experience required", o=ORG_ID,
            co=company_ids[i % 3], dpt=dept_ids[i % len(dept_ids)], smin=s_min, smax=s_max,
            exp=date(SEED_YEAR + 1, 1, 1), pub=MONTH_START)
        job_ids.append(jid)
        job_count += 1
    else:
        job_ids.append(q("SELECT id FROM job_openings WHERE organization_id=:o AND title=:t", o=ORG_ID, t=title)[0][0])

cand_names = [
    ("Alice Johnson", "alice.johnson@email.com"), ("Bob Smith", "bob.smith@email.com"),
    ("Carol White", "carol.white@email.com"), ("David Brown", "david.brown@email.com"),
    ("Emma Wilson", "emma.wilson@email.com"), ("Frank Miller", "frank.miller@email.com"),
    ("Grace Lee", "grace.lee@email.com"), ("Henry Davis", "henry.davis@email.com"),
]
for i, (cname, cemail) in enumerate(cand_names):
    jid = job_ids[i % len(job_ids)]
    status = random.choice(["applied", "screened", "shortlisted", "interviewed", "offered", "hired", "rejected"])
    applied = MONTH_START + timedelta(days=random.randint(1, max(1, DAYS_IN_MONTH - 5)))
    cid = exe_return(
        "INSERT INTO candidates (full_name, email, phone, job_opening_id, company_id, status, source, current_company, current_position, experience_years, applied_date) "
        "VALUES (:n,:em,:ph,:jid,:co,:st,:src,:cc,:cp,:exp,:appl)",
        n=cname, em=cemail, ph=f"+91 98765{i:04d}", jid=jid, co=company_ids[i % 3], st=status,
        src=random.choice(["LinkedIn", "Referral", "Indeed", "Company Site"]),
        cc=random.choice(["TechCorp", "DataWorks", "Cloudify", "AppGenius"]),
        cp=random.choice(["Engineer", "Manager", "Analyst", "Consultant"]),
        exp=random.randint(1, 8), appl=applied)
    cand_count += 1
    if status in ("interviewed", "offered", "hired"):
        iv_date = applied + timedelta(days=random.randint(3, 10))
        exe_return(
            "INSERT INTO interviews (candidate_id, interviewer_id, company_id, job_opening_id, interview_type, interview_round, date, duration_minutes, "
            "status, rating, technical_score, communication_score, overall_score) "
            "VALUES (:cand,:iv,:co,:jid,'technical',1,:d,60,:st,:rating,:tech,:comm,:overall)",
            cand=cid, iv=1, co=company_ids[i % 3], jid=jid, d=iv_date,
            st=random.choice(["completed", "scheduled", "completed"]),
            rating=random.randint(2, 5), tech=random.randint(4, 10), comm=random.randint(4, 10),
            overall=random.randint(4, 10))
        int_count += 1
print(f"  Jobs: {job_count}, Candidates: {cand_count}, Interviews: {int_count}")

# ============ 15. PERFORMANCE REVIEWS ============
print("Seeding performance reviews...")
rev_count = 0
for eid in emp_ids:
    for period in ["Q1", "Q2", "Annual"]:
        if q("SELECT id FROM performance_reviews WHERE employee_id=:e AND review_period=:p AND review_year=:y",
             e=eid, p=period, y=SEED_YEAR):
            continue
        scores = [random.randint(2, 5) for _ in range(8)]
        overall = round(sum(scores) / len(scores), 1)
        exe_return(
            "INSERT INTO performance_reviews (employee_id, reviewer_id, review_period, review_year, review_date, organization_id, company_id, department_id, "
            "productivity_score, quality_score, communication_score, teamwork_score, leadership_score, initiative_score, punctuality_score, attendance_score, "
            "overall_score, rating, goals_set, goals_achieved, strengths, areas_for_improvement, development_plan, reviewer_position, review_cycle, status) "
            "VALUES (:e,:rev,:p,:y,:rd,:o,:co,:dpt,:s1,:s2,:s3,:s4,:s5,:s6,:s7,:s8,:ov,:rating,:gs,:ga,:stg,:afi,:dp,:rp,:rc,'completed')",
            e=eid, rev=1, p=period, y=SEED_YEAR, rd=MONTH_START + timedelta(days=10),
            o=ORG_ID, co=q("SELECT company_id FROM employees WHERE id=:e", e=eid)[0][0],
            dpt=q("SELECT department_id FROM employees WHERE id=:e", e=eid)[0][0],
            s1=scores[0], s2=scores[1], s3=scores[2], s4=scores[3], s5=scores[4], s6=scores[5], s7=scores[6], s8=scores[7],
            ov=overall, rating=round(overall, 1),
            gs="Strong performer with good results", ga="Continue improving leadership",
            stg="Technical training", afi="Take ownership of projects",
            dp="Enroll in leadership training", rp="Senior Manager", rc="Half-yearly")
        rev_count += 1
print(f"  Performance reviews: {rev_count}")

# ============ 16. GOALS ============
print("Seeding goals...")
goal_count = 0
goals = [
    ("Complete Q3 sprint deliverables", "project", 80),
    ("Improve customer satisfaction score", "performance", 65),
    ("Complete AWS certification", "learning", 40),
    ("Reduce response time by 20%", "performance", 55),
    ("Launch new marketing campaign", "project", 70),
]
for eid in emp_ids[:8]:
    for title, gtype, prog in goals[:3]:
        if q("SELECT id FROM goals WHERE employee_id=:e AND title=:t", e=eid, t=title):
            continue
        exe_return(
            "INSERT INTO goals (employee_id, organization_id, company_id, department_id, title, description, goal_type, category, start_date, target_date, "
            "progress, status, priority) "
            "VALUES (:e,:o,:co,:dpt,:t,:desc,:gt,:cat,:sd,:td,:prog,:st,:pri)",
            e=eid, o=ORG_ID, co=q("SELECT company_id FROM employees WHERE id=:e", e=eid)[0][0],
            dpt=q("SELECT department_id FROM employees WHERE id=:e", e=eid)[0][0],
            t=title, desc=title, gt=gtype, cat=random.choice(["professional", "project", "learning"]),
            sd=MONTH_START, td=MONTH_END, prog=prog, st=random.choice(["in_progress", "in_progress", "completed"]),
            pri=random.choice(["high", "medium", "low"]))
        goal_count += 1
print(f"  Goals: {goal_count}")

# ============ 17. ASSETS ============
print("Seeding assets...")
asset_count = 0
assets = [
    ("Laptop", "MacBook Pro 14\""), ("Desktop", "Dell OptiPlex"), ("Mobile", "iPhone 15"),
    ("Monitor", "Dell 27\""), ("Headset", "Sony WH-1000XM5"), ("Keyboard", "Logitech MX Keys"),
]
for i, (atype, aname) in enumerate(assets):
    if q("SELECT id FROM assets WHERE asset_name=:n AND organization_id=:o", n=aname, o=ORG_ID):
        continue
    eid = emp_ids[i % len(emp_ids)]
    exe_return(
        "INSERT INTO assets (employee_id, asset_type, asset_name, serial_number, status, purchase_date, issue_date, value, organization_id) "
        "VALUES (:e,:at,:n,'SN'||:i,:st,:pd,:idate,:val,:o)",
        e=eid, at=atype, n=aname, i=i, st=random.choice(["assigned", "assigned", "in_stock"]),
        pd=date(SEED_YEAR - 1, 1, 1), idate=MONTH_START + timedelta(days=i),
        val=random.choice([50000, 60000, 80000, 25000, 30000, 15000]), o=ORG_ID)
    asset_count += 1
print(f"  Assets: {asset_count}")

# ============ 18. NOTIFICATIONS ============
print("Seeding notifications...")
notif_count = 0
notif_templates = [
    ("Leave request approved", "Your leave has been approved", "leave"),
    ("Payroll processed", "Your salary for this month has been processed", "payroll"),
    ("New expense submitted", "An expense claim was submitted", "expense"),
    ("Performance review due", "Your performance review is pending", "performance"),
    ("Attendance reminder", "Don't forget to mark your attendance", "attendance"),
]
for i, (title, body, ntype) in enumerate(notif_templates):
    for uid in user_emp.keys():
        if q("SELECT id FROM notifications WHERE user_id=:u AND title=:t", u=uid, t=title):
            continue
        exe_return(
            "INSERT INTO notifications (user_id, title, body, type, is_read, created_at) "
            "VALUES (:u,:t,:b,:ty,false,:d)",
            u=uid, t=title, b=body, ty=ntype, d=MONTH_START + timedelta(days=i * 3))
        notif_count += 1
print(f"  Notifications: {notif_count}")

# ============ 19. ACTIVITY LOGS ============
print("Seeding activity logs...")
log_count = 0
actions = [
    ("attendance", "CHECK_IN"), ("leaves", "APPLY"), ("payroll", "PROCESS"),
    ("expenses", "SUBMIT"), ("recruitment", "CREATE_CANDIDATE"), ("employees", "UPDATE"),
]
for i, (module, action) in enumerate(actions):
    for eid in emp_ids[:6]:
        if q("SELECT id FROM activity_logs WHERE module=:m AND action=:a AND entity_id=:ei", m=module, a=action, ei=str(eid)):
            continue
        exe_return(
            "INSERT INTO activity_logs (user_id, module, action, entity_type, entity_id, entity_name, ip_address, user_agent, created_at) "
            "VALUES (:u,:m,:a,'employee',:ei,:n,'127.0.0.1','seeded',:d)",
            u=1, m=module, a=action, ei=str(eid), n=f"Activity {module} {eid}", d=MONTH_START + timedelta(days=i))
        log_count += 1
print(f"  Activity logs: {log_count}")

# ============ 20. PLAN + SUBSCRIPTION ============
print("Seeding plan + subscription...")
plan = q("SELECT id FROM plans WHERE name='pro'")
if not plan:
    pid = exe_return("INSERT INTO plans (name, display_name, price_monthly, price_yearly, max_employees, features, is_active) "
                     "VALUES ('pro','Pro',499,4990,500,'[\"payroll\",\"recruitment\",\"performance\",\"reports\"]'::json,true)")
else:
    pid = plan[0][0]
if not q("SELECT id FROM subscriptions WHERE organization_id=:o", o=ORG_ID):
    exe_return("INSERT INTO subscriptions (organization_id, plan_id, status, billing_cycle, next_billing_date) "
               "VALUES (:o,:p,'active','monthly',:nb)", o=ORG_ID, p=pid, nb=MONTH_END + timedelta(days=15))
print(f"  Plan id={pid}, subscription set")

print("\n=========== SEED COMPLETE ===========")
print(f"Month: {SEED_MONTH}/{SEED_YEAR}, Companies: {len(company_ids)}, Employees: {len(emp_ids)}")
print(f"Attendance: {att_count}, Leaves: {lv_count}, Expenses: {exp_count}, Payroll: {pay_count}")
print(f"Reviews: {rev_count}, Goals: {goal_count}, Assets: {asset_count}, Notifications: {notif_count}")
