"""Lock in payroll correctness behaviors: duplicate guards, proration, rounding, employer items."""

from datetime import datetime

from models import Employee, Organization, Payroll, User
from services.payslip_service import get_payslip_data


def _admin_org(db_session):
    user = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    assert user is not None, "Seeded admin user missing"
    return user.organization_id


def _mk(db_session, join_day=1, leaving=None, org=None):
    if org is None:
        org = Organization(name="PC Org", code="PCORG", country="India")
        db_session.add(org)
        db_session.flush()
    emp = Employee(
        first_name="Pc", last_name="User", email="pc@example.com",
        employee_code="PC001", designation="Engineer",
        organization_id=org.id, base_salary=600000, status="active",
        join_date=datetime(2020, 1, 1), date_of_leaving=leaving,
    )
    db_session.add(emp)
    db_session.flush()
    return org, emp


def _mk_att_policy(db_session, org):
    from models import AttendancePolicy
    ap = db_session.query(AttendancePolicy).filter(AttendancePolicy.organization_id == org.id).first()
    if ap:
        return ap
    ap = AttendancePolicy(organization_id=org.id, working_days="1,2,3,4,5,6",
                          half_day_threshold_hours=4, half_day_as_full_paid=True,
                          paid_leave_as_present=True, holiday_as_present=True)
    db_session.add(ap)
    db_session.flush()
    return ap


def test_generate_allows_multiple_payslips(client, db_session, admin_token):
    """Multiple payslips per employee/period are allowed (no 409 duplicate guard)."""
    org = db_session.query(Organization).filter(
        Organization.id == _admin_org(db_session)
    ).first()
    org, emp = _mk(db_session, org=org)
    h = {"Authorization": f"Bearer {admin_token}"}
    first = client.post(f"/api/payroll/generate?employeeId={emp.id}&month=6&year=2026", headers=h)
    second = client.post(f"/api/payroll/generate?employeeId={emp.id}&month=6&year=2026", headers=h)
    assert first.status_code == 200
    assert second.status_code == 200
    count = db_session.query(Payroll).filter(
        Payroll.employee_id == emp.id, Payroll.month == 6, Payroll.year == 2026,
        Payroll.deleted_at.is_(None),
    ).count()
    assert count == 2


def test_generate_all_returns_run(client, db_session, admin_token):
    """generate-all is async: it returns a runId immediately for progress polling."""
    org, emp = _mk(db_session)
    h = {"Authorization": f"Bearer {admin_token}"}
    first = client.post(f"/api/payroll/generate-all?month=6&year=2026", headers=h)
    assert first.status_code == 200
    assert first.json().get("runId")


def test_mid_month_deductions_prorated(db_session):
    """PF/ESI scale with prorated basic/gross for a partial month; PT stays monthly."""
    from datetime import date
    from models import Attendance, StatutorySetting
    from services.payroll_service import calculate_payroll
    org, emp = _mk(db_session)
    emp.base_salary = 120000  # monthly basic 10000 -> gross 17850 (ESI applies, PF uncapped)
    db_session.flush()
    db_session.add(StatutorySetting(
        organization_id=org.id, status="active",
        pf_applicable=True, pf_employee_rate=12.0, pf_employer_rate=12.0,
        pf_max_monthly=1800.0, pf_min_basic_for_exclusion=1000000.0,
        esi_applicable=True, esi_employee_rate=0.75, esi_employer_rate=3.25,
        esi_gross_ceiling=21000.0, pt_applicable=False, lwf_applicable=False,
    ))
    db_session.flush()
    for d in range(1, 31):
        db_session.add(Attendance(employee_id=emp.id, date=date(2026, 6, d),
                                  status="present", is_manual_entry=True))
    db_session.flush()
    full = calculate_payroll(db_session, emp, 6, 2026, override_tds=0)
    # Join mid-month: attendance days before 16 no longer count towards paid days
    emp.join_date = datetime(2026, 6, 16)
    db_session.flush()
    partial = calculate_payroll(db_session, emp, 6, 2026, override_tds=0)
    assert full["basic_salary"] > 0
    assert partial["basic_salary"] < full["basic_salary"]
    assert partial["basic_salary"] > 0
    assert partial["pf_deduction"] < full["pf_deduction"]
    assert partial["esi_deduction"] < full["esi_deduction"]
    assert 0 < partial["pf_deduction"] < full["pf_deduction"]
    assert 0 < partial["esi_deduction"] < full["esi_deduction"]


def test_net_salary_reconciles(db_session):
    """Net salary exactly reconciles: earnings - deductions, to 2 decimals."""
    from services.payroll_service import calculate_payroll
    org, emp = _mk(db_session)
    r = calculate_payroll(db_session, emp, 6, 2026)
    expected = round(r["total_earnings"] - r["total_deductions"], 2)
    assert abs(r["net_salary"] - expected) < 0.005
    assert round(r["net_salary"], 2) == round(expected, 2)


def test_employer_contributions_on_payslip(client, db_session):
    """Payslip data exposes employer PF/ESI contributions and gratuity."""
    org, emp = _mk(db_session)
    p = Payroll(employee_id=emp.id, organization_id=org.id, month=6, year=2026,
                gross_salary=50000, net_salary=40000, status="processed",
                pf_employer_contribution=1800, esi_employer_contribution=1625)
    db_session.add(p)
    db_session.flush()
    data = get_payslip_data(db_session, p.id)
    payroll = data["payroll"]
    assert payroll["pf_employer_contribution"] == 1800
    assert payroll["esi_employer_contribution"] == 1625


def test_fx_summary_conversion(client, db_session, admin_token):
    """Payroll summary converts totals using configured FX rates."""
    from models import User
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    org = db_session.query(Organization).filter(Organization.id == admin.organization_id).first()
    emp = Employee(
        first_name="Fx", last_name="User", email="fx@example.com",
        employee_code="FX002", designation="Engineer",
        organization_id=org.id, base_salary=600000, status="active",
        join_date=datetime(2020, 1, 1),
    )
    db_session.add(emp); db_session.flush()
    org.default_currency = "INR"
    org.settings = {"payroll": {"currency_rates": {"USD": 0.012}}}
    db_session.add(Payroll(employee_id=emp.id, organization_id=org.id, month=6, year=2026,
                           gross_salary=50000, total_deductions=10000, net_salary=40000,
                           status="processed"))
    db_session.flush()
    h = {"Authorization": f"Bearer {admin_token}"}
    base = client.get("/api/payroll/summary?month=6&year=2026", headers=h).json()
    usd = client.get("/api/payroll/summary?month=6&year=2026&currency=USD", headers=h).json()
    assert base["baseCurrency"] == "INR"
    assert usd["fxRate"] == 0.012
    assert abs(usd["totalNetSalary"] - round(40000 * 0.012, 2)) < 0.01


def test_compliance_challans(client, db_session, admin_token):
    """Compliance challan endpoint aggregates statutory liabilities for the period."""
    from models import User
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    org = db_session.query(Organization).filter(Organization.id == admin.organization_id).first()
    emp = Employee(
        first_name="Cc", last_name="User", email="cc@example.com",
        employee_code="CC001", designation="Engineer",
        organization_id=org.id, base_salary=600000, status="active",
        join_date=datetime(2020, 1, 1),
    )
    db_session.add(emp); db_session.flush()
    db_session.add(Payroll(employee_id=emp.id, organization_id=org.id, month=6, year=2026,
                           status="processed", total_earnings=50000, net_salary=40000,
                           pf_deduction=1200, pf_employer_contribution=1200,
                           esi_deduction=375, esi_employer_contribution=1625,
                           professional_tax=200, tds_deduction=5000))
    db_session.add(Payroll(employee_id=emp.id, organization_id=org.id, month=6, year=2026,
                           status="draft", total_earnings=99999, net_salary=99999,
                           pf_deduction=9999, professional_tax=9999))
    db_session.flush()
    h = {"Authorization": f"Bearer {admin_token}"}
    data = client.get("/api/payroll/compliance/challans?month=6&year=2026", headers=h).json()
    t = data["totals"]
    # draft record excluded
    assert t["employee_count"] == 1
    assert t["pf_employee"] == 1200
    assert t["pf_employer"] == 1200
    assert t["professional_tax"] == 200
    assert t["tds"] == 5000


def test_arrears_from_backdated_revision(db_session):
    """A backdated raise pays arrears for months that were never generated."""
    from models import SalaryRevision
    from services.payroll_service import calculate_payroll
    org, emp = _mk(db_session)
    db_session.add(SalaryRevision(employee_id=emp.id, effective_from=datetime(2026, 4, 1),
                                  base_salary=720000, reason="promotion"))
    db_session.flush()
    r = calculate_payroll(db_session, emp, 6, 2026, override_pf_deduction=0,
                          override_professional_tax=0, override_esi_deduction=0, override_tds=0)
    # new monthly 60000 - old monthly 50000 = 10000/mo x 2 unprocessed months (Apr, May)
    assert r["arrears"] == 20000.0


def test_company_country_overrides_org(db_session):
    """A US company under an Indian org runs US jurisdiction (no PF/PT)."""
    from models import Company
    from services.payroll_service import calculate_payroll
    org, emp = _mk(db_session)
    us = Company(name="US Office", code="USCO", organization_id=org.id, country="United States", status="active")
    db_session.add(us); db_session.flush()
    emp.company_id = us.id
    db_session.flush()
    r = calculate_payroll(db_session, emp, 6, 2026, override_tds=0)
    assert r["pf_deduction"] == 0.0
    assert r["esi_deduction"] == 0.0
    assert r["professional_tax"] == 0.0
    assert r["country"] == "United States"


def test_scoped_company_statutory_config(db_session):
    """A scoped payroll config for a company forces its own jurisdiction."""
    from models import Company
    from services.payroll_service import calculate_payroll
    org, emp = _mk(db_session)
    dubai = Company(name="Dubai Office", code="DXB", organization_id=org.id, country="India", status="active")
    db_session.add(dubai); db_session.flush()
    emp.company_id = dubai.id
    org.settings = {"payroll_configs": [
        {"companyId": dubai.id, "branchId": None, "country": "United Arab Emirates",
         "pfApplicable": False, "esiApplicable": False, "ptApplicable": False,
         "lwfApplicable": False, "gratuityApplicable": False},
    ]}
    db_session.flush()
    r = calculate_payroll(db_session, emp, 6, 2026, override_tds=0)
    assert r["pf_deduction"] == 0.0
    assert r["professional_tax"] == 0.0
    assert r["country"] == "United Arab Emirates"


def test_payroll_record_persists_jurisdiction(db_session):
    """Generated payroll snapshots the effective country/state for audit."""
    from models import Company
    from services.payroll_service import generate_payroll_record
    org, emp = _mk(db_session)
    us = Company(name="US Branch", code="USB", organization_id=org.id, country="United States", status="active")
    db_session.add(us); db_session.flush()
    emp.company_id = us.id
    db_session.flush()
    p = generate_payroll_record(db_session, emp, 6, 2026)
    assert p.country == "United States"
    assert p.registered_state is None
    assert p.company_id == us.id


def test_generate_all_branch_filter(client, db_session, admin_token):
    """generate-all honours a branchId so payroll runs branch-wise."""
    from models import Branch, EmployeeBranchAssignment, User
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    org = db_session.query(Organization).filter(Organization.id == admin.organization_id).first()
    emp = Employee(first_name="Pc", last_name="One", email="pcb1@example.com",
                   employee_code="PCB1", designation="E", organization_id=org.id,
                   base_salary=600000, status="active", join_date=datetime(2020, 1, 1))
    emp2 = Employee(first_name="Pc", last_name="Two", email="pcb2@example.com",
                    employee_code="PCB2", designation="E", organization_id=org.id,
                    base_salary=600000, status="active", join_date=datetime(2020, 1, 1))
    db_session.add_all([emp, emp2]); db_session.flush()
    b1 = Branch(name="Branch A", organization_id=org.id, company_id=None, status="active")
    b2 = Branch(name="Branch B", organization_id=org.id, company_id=None, status="active")
    db_session.add_all([b1, b2]); db_session.flush()
    db_session.add_all([
        EmployeeBranchAssignment(employee_id=emp.id, branch_id=b1.id, status="active"),
        EmployeeBranchAssignment(employee_id=emp2.id, branch_id=b2.id, status="active"),
    ])
    db_session.flush()
    h = {"Authorization": f"Bearer {admin_token}"}
    r = client.post(f"/api/payroll/generate-all?month=6&year=2026&branchId={b1.id}", headers=h)
    data = r.json()
    assert r.status_code == 200
    assert data.get("runId")


def test_company_country_via_api(client, db_session, admin_token):
    """Company create/update persists the country via the API."""
    from models import Company
    h = {"Authorization": f"Bearer {admin_token}"}
    r = client.post("/api/companies", json={
        "name": "API US Co", "code": "APIUS", "country": "United States", "status": "active",
    }, headers=h)
    assert r.status_code == 200
    comp = db_session.query(Company).filter(Company.id == r.json()["id"]).first()
    assert comp.country == "United States"
    upd = client.put(f"/api/companies/{comp.id}", json={"country": "Canada"}, headers=h)
    assert upd.status_code == 200
    db_session.refresh(comp)
    assert comp.country == "Canada"


def test_employee_company_id_persists_via_api(client, db_session, admin_token):
    """Employee create with company_id links the legacy column used by payroll."""
    from models import Company, Employee
    h = {"Authorization": f"Bearer {admin_token}"}
    r = client.post("/api/companies", json={
        "name": "API US Co 2", "code": "APIUS2", "country": "United States", "status": "active",
    }, headers=h)
    cid = r.json()["id"]
    r2 = client.post("/api/employees", json={
        "firstName": "Company", "lastName": "Linked", "email": "clink@example.com",
        "employee_code": "CLINK", "designation": "E", "company_id": cid,
        "base_salary": 1200000, "status": "active", "join_date": "2020-01-01",
    }, headers=h)
    assert r2.status_code == 200
    emp = db_session.query(Employee).filter(Employee.id == r2.json().get("id", r2.json().get("employee", {}).get("id"))).first()
    assert emp is not None
    assert emp.company_id == cid


def test_loan_amortization_on_generate(db_session):
    """Generating a payroll decrements the loan's remaining_months and clamps the deduction."""
    from models import SalaryLoan
    from services.payroll_service import _get_loan_deduction_total, generate_payroll_record
    org, emp = _mk(db_session)
    db_session.add(SalaryLoan(
        employee_id=emp.id, loan_type="loan", principal_amount=60000,
        monthly_deduction=10000, total_months=6, remaining_months=3,
        start_month=6, start_year=2026, status="active",
    ))
    db_session.flush()
    assert _get_loan_deduction_total(db_session, emp, 2026, 6) == 10000
    p = generate_payroll_record(db_session, emp, 6, 2026)
    loan = db_session.query(SalaryLoan).filter(SalaryLoan.employee_id == emp.id).first()
    assert loan.remaining_months == 2
    assert loan.status == "active"
    # Principal nearly exhausted -> deduction clamped to remaining principal
    loan.principal_amount = 15000
    loan.remaining_months = 2
    db_session.flush()
    assert _get_loan_deduction_total(db_session, emp, 2026, 7) == 5000
    loan.principal_amount = 60000
    loan.remaining_months = 1
    db_session.flush()
    generate_payroll_record(db_session, emp, 7, 2026)
    db_session.refresh(loan)
    assert loan.remaining_months == 0
    assert loan.status == "closed"


def test_approved_leave_deducts_balance(db_session):
    """Approving a leave decrements the matching LeaveBalance once (no double deduction)."""
    from models import LeaveApplication, LeaveBalance, LeaveType
    from routers.leaves import _deduct_leave_balance
    org, emp = _mk(db_session)
    lt = LeaveType(name="Annual", code="annual", organization_id=org.id)
    db_session.add(lt); db_session.flush()
    db_session.add(LeaveBalance(employee_id=emp.id, year=2026, leave_type_id=lt.id,
                                total_days=12, used_days=0, remaining_days=12))
    db_session.flush()
    lv = LeaveApplication(employee_id=emp.id, leave_type_id=lt.id, organization_id=org.id,
                          start_date=datetime(2026, 6, 1), end_date=datetime(2026, 6, 3),
                          total_days=3, status="approved")
    db_session.add(lv); db_session.flush()
    _deduct_leave_balance(db_session, lv)
    bal = db_session.query(LeaveBalance).filter(LeaveBalance.employee_id == emp.id).first()
    assert bal.remaining_days == 9
    assert lv.balance_deducted == 3
    _deduct_leave_balance(db_session, lv)  # second call must not double-deduct
    db_session.refresh(bal)
    assert bal.remaining_days == 9


def test_leave_balance_clamped_at_zero(db_session):
    """Over-leave clamps remaining balance at 0 rather than going negative."""
    from models import LeaveApplication, LeaveBalance, LeaveType
    from routers.leaves import _deduct_leave_balance
    org, emp = _mk(db_session)
    lt = LeaveType(name="Casual", code="casual", organization_id=org.id)
    db_session.add(lt); db_session.flush()
    db_session.add(LeaveBalance(employee_id=emp.id, year=2026, leave_type_id=lt.id,
                                total_days=2, used_days=0, remaining_days=2))
    db_session.flush()
    lv = LeaveApplication(employee_id=emp.id, leave_type_id=lt.id, organization_id=org.id,
                          start_date=datetime(2026, 6, 1), end_date=datetime(2026, 6, 5),
                          total_days=5, status="approved")
    db_session.add(lv); db_session.flush()
    _deduct_leave_balance(db_session, lv)
    bal = db_session.query(LeaveBalance).filter(LeaveBalance.employee_id == emp.id).first()
    assert bal.remaining_days == 0


def test_wfh_counts_as_present(db_session):
    """Work-from-home attendance days count as paid present days."""
    from models import Attendance, AttendancePolicy
    from services.payroll_service import _get_attendance_counts
    org, emp = _mk(db_session)
    att = _mk_att_policy(db_session, org)
    db_session.add(Attendance(employee_id=emp.id, organization_id=org.id, date=datetime(2026, 6, 1),
                              status="work_from_home", work_hours=8))
    db_session.flush()
    counts = _get_attendance_counts(db_session, emp.id, 2026, 6, att)
    assert counts["present_days"] >= 1
    assert counts["paid_days"] >= 1


def test_pending_leave_not_paid(db_session):
    """A pending (unapproved) leave must not count as paid days in payroll."""
    from models import Attendance, AttendancePolicy, LeaveApplication, LeaveType
    from services.payroll_service import _get_attendance_counts
    org, emp = _mk(db_session)
    lt = LeaveType(name="Annual", code="annual", organization_id=org.id)
    db_session.add(lt); db_session.flush()
    lv = LeaveApplication(employee_id=emp.id, leave_type_id=lt.id, organization_id=org.id,
                          start_date=datetime(2026, 6, 2), end_date=datetime(2026, 6, 3),
                          total_days=2, status="pending", is_paid=True)
    db_session.add(lv); db_session.flush()
    db_session.add(Attendance(employee_id=emp.id, organization_id=org.id, date=datetime(2026, 6, 2),
                              status="on_leave", is_on_leave=True, leave_application_id=lv.id))
    db_session.flush()
    att = _mk_att_policy(db_session, org)
    counts = _get_attendance_counts(db_session, emp.id, 2026, 6, att, employee=emp)
    assert counts["paid_leave_days"] == 0
    assert counts["unpaid_leave_days"] >= 1


def test_weekend_holiday_does_not_mask_absence(db_session):
    """A holiday on a non-working day must not inflate paid_days and hide an absence."""
    from models import Attendance, AttendancePolicy
    from services.payroll_service import _get_attendance_counts
    org, emp = _mk(db_session)
    # June 2026: 7th is a Sunday (weekend holiday); employee absent on 8th.
    db_session.add(Attendance(employee_id=emp.id, organization_id=org.id, date=datetime(2026, 6, 7),
                              status="holiday", is_holiday=True))
    db_session.add(Attendance(employee_id=emp.id, organization_id=org.id, date=datetime(2026, 6, 8),
                              status="absent"))
    db_session.flush()
    att = _mk_att_policy(db_session, org)
    counts = _get_attendance_counts(db_session, emp.id, 2026, 6, att, employee=emp)
    assert counts["holiday_days"] == 0  # weekend holiday excluded
    assert counts["absent_days"] == 1
    assert counts["paid_days"] < counts["working_days"]  # absence not masked


def test_encashment_consumes_balance(db_session):
    """Leave encashment consumes the balance so it is not paid every month."""
    from models import LeaveBalance, LeaveType
    from services.payroll_service import _consume_encashed_leave, _get_leave_encashment
    org, emp = _mk(db_session)
    org.settings = {"payroll": {"leaveEncashment": True, "encashableLeaveCodes": ["annual"], "leaveEncashmentMaxDays": 30}}
    lt = LeaveType(name="Annual", code="annual", organization_id=org.id)
    db_session.add(lt); db_session.flush()
    db_session.add(LeaveBalance(employee_id=emp.id, year=2026, leave_type_id=lt.id,
                                total_days=14, used_days=0, remaining_days=14))
    db_session.flush()
    amount = _get_leave_encashment(db_session, emp, 2026, 6, 50000, 22)
    assert amount > 0
    _consume_encashed_leave(db_session, emp, 2026)
    bal = db_session.query(LeaveBalance).filter(LeaveBalance.employee_id == emp.id).first()
    assert bal.remaining_days == 0
    assert _get_leave_encashment(db_session, emp, 2026, 7, 50000, 22) == 0.0


def test_reverse_paid_payroll(client, db_session, admin_token):
    """A paid payroll can be reversed to cancelled (reversal action)."""
    from models import User
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    org, emp = _mk(db_session)
    emp.organization_id = admin.organization_id
    db_session.flush()
    p = Payroll(employee_id=emp.id, organization_id=admin.organization_id, month=6, year=2026,
                gross_salary=50000, net_salary=40000, status="paid", paid_at=datetime(2026, 6, 30))
    db_session.add(p); db_session.flush()
    h = {"Authorization": f"Bearer {admin_token}"}
    r = client.post("/api/payroll/bulk-status", json={"payrollIds": [p.id], "action": "reverse_paid"}, headers=h)
    assert r.status_code == 200
    assert r.json().get("count") == 1
    db_session.refresh(p)
    assert p.status == "cancelled"
    assert p.paid_at is None


def test_bank_disbursement_export(client, db_session, admin_token):
    """Disbursement CSV includes the bank account snapshot + IFSC + net salary."""
    from models import User
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    org, emp = _mk(db_session)
    emp.organization_id = admin.organization_id
    emp.bank_name = "HDFC Bank"
    emp.bank_account_number = "12345678901"
    emp.ifsc_code = "HDFC0001234"
    db_session.flush()
    p = Payroll(employee_id=emp.id, organization_id=admin.organization_id, month=6, year=2026,
                gross_salary=50000, net_salary=40000, status="paid",
                bank_account="12345678901", ifsc_code="HDFC0001234")
    db_session.add(p); db_session.flush()
    h = {"Authorization": f"Bearer {admin_token}"}
    r = client.get("/api/payroll/disbursement?month=6&year=2026", headers=h)
    assert r.status_code == 200
    assert "12345678901" in r.text
    assert "HDFC0001234" in r.text
    assert "40000" in r.text


def test_fnf_uses_monthly_salary(db_session):
    """F&F treats base_salary as ANNUAL CTC, so monthly gross is /12, not 12x.
    Salary until last working day is prorated by ACTUAL attendance (shared with
    payroll) so an employee with no attendance records in the final month gets
    the same ₹0 the payroll run would produce."""
    from services.exit_management_service import calculate_full_final_settlement
    org, emp = _mk(db_session)
    emp.base_salary = 1200000  # annual CTC -> 100000/month
    emp.date_of_leaving = datetime(2026, 6, 30)
    db_session.flush()
    res = calculate_full_final_settlement(db_session, emp.id)
    assert res["monthly_gross"] == 100000.0
    assert res["payables"]["salary_until_last_working_day"] == 0.0
    assert res["final_month_attendance"]["proration_factor"] == 0.0


def test_fnf_recovery_from_loans(db_session):
    """Outstanding loans/advances are recovered in the F&F settlement."""
    from models import SalaryLoan
    from services.exit_management_service import calculate_full_final_settlement
    org, emp = _mk(db_session)
    emp.base_salary = 1200000
    emp.date_of_leaving = datetime(2026, 6, 30)
    db_session.flush()
    db_session.add(SalaryLoan(employee_id=emp.id, loan_type="advance", principal_amount=60000,
                              monthly_deduction=10000, total_months=6, remaining_months=3,
                              start_month=1, start_year=2026, status="active"))
    db_session.flush()
    res = calculate_full_final_settlement(db_session, emp.id)
    assert res["deductions"]["pending_advances"] == 30000
    assert res["total_deductions"] >= 30000


def test_salary_revision_components_apply(db_session):
    """A salary revision's components drive payroll from the effective month."""
    from datetime import date
    from models import Attendance, SalaryRevision
    from services.payroll_service import calculate_payroll
    org, emp = _mk(db_session)
    emp.salary_components = {"basic": 30000, "hra": 12000}
    db_session.flush()
    for d in range(1, 31):
        db_session.add(Attendance(employee_id=emp.id, date=date(2026, 6, d),
                                  status="present", is_manual_entry=True))
    for d in range(1, 32):
        db_session.add(Attendance(employee_id=emp.id, date=date(2026, 5, d),
                                  status="present", is_manual_entry=True))
    db_session.flush()
    rev = SalaryRevision(employee_id=emp.id, effective_from=datetime(2026, 6, 1),
                         base_salary=2400000, salary_components={"basic": 60000, "hra": 24000})
    db_session.add(rev); db_session.flush()
    r = calculate_payroll(db_session, emp, 6, 2026, override_tds=0,
                          override_pf_deduction=0, override_professional_tax=0, override_esi_deduction=0)
    assert r["basic_salary"] == 60000
    assert r["hra"] == 24000
    # Historical month before the revision still uses the old components
    r_old = calculate_payroll(db_session, emp, 5, 2026, override_tds=0,
                              override_pf_deduction=0, override_professional_tax=0, override_esi_deduction=0)
    assert r_old["basic_salary"] == 30000


def test_expense_create_forces_pending(client, db_session, admin_token):
    """Expense create always starts as pending, even if the client sends 'approved'."""
    from models import Employee, User
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    org, emp = _mk(db_session)
    emp.organization_id = admin.organization_id
    db_session.flush()
    h = {"Authorization": f"Bearer {admin_token}"}
    r = client.post("/api/expenses", data={
        "employeeId": emp.id, "category": "Travel", "amount": 500,
        "expenseDate": "2026-06-01", "status": "approved",
    }, headers=h)
    assert r.status_code == 200
    assert r.json().get("status") == "pending"


def test_payslip_pdf_itemizes_arrears(db_session):
    """Payslip PDF itemizes salary arrears & leave encashment out of other_earnings."""
    from services.payslip_service import generate_payslip_pdf
    org, emp = _mk(db_session)
    p = Payroll(
        employee_id=emp.id, organization_id=org.id, month=6, year=2026,
        status="processed", basic_salary=50000, total_earnings=52000,
        net_salary=40000, other_earnings=2000,
        component_breakdown=[
            {"name": "Arrears", "display_name": "Salary Arrears", "type": "earnings", "value": 1500},
            {"name": "Leave Encashment", "display_name": "Leave Encashment", "type": "earnings", "value": 500},
        ],
    )
    db_session.add(p)
    db_session.flush()
    pdf = generate_payslip_pdf(db_session, p.id)
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 1000


def test_leave_encashment_opt_in(db_session):
    """Unused paid-leave balance encashes when enabled (daily rate = basic/30)."""
    from models import LeaveBalance, LeaveType
    from services.payroll_service import calculate_payroll
    org, emp = _mk(db_session)
    org.settings = {"payroll": {"leaveEncashment": True, "encashableLeaveCodes": ["annual"]}}
    lt = LeaveType(name="Annual", code="annual", days_allowed=24, organization_id=org.id, status="active")
    db_session.add(lt); db_session.flush()
    db_session.add(LeaveBalance(employee_id=emp.id, year=2026, leave_type_id=lt.id,
                                total_days=24, used_days=10, remaining_days=14))
    db_session.flush()
    r = calculate_payroll(db_session, emp, 6, 2026, override_pf_deduction=0,
                          override_professional_tax=0, override_esi_deduction=0, override_tds=0)
    # monthly basic 50000 / 30 = 1666.67 x 14 days
    assert r["leave_encashment"] > 0
    assert abs(r["leave_encashment"] - round(50000 / 30 * 14, 2)) < 0.01


def test_form16_pdf_generated(db_session):
    """Form 16 PDF renders with Part A (employer/TAN) and Part B (income/tax) and totals TDS."""
    from services.form16_service import generate_form16_pdf, get_form16_data
    org, emp = _mk(db_session)
    org.pan_no = "ABCDE1234F"
    org.tan_no = "BLRZ12345A"
    for m in (4, 5, 6):
        db_session.add(Payroll(
            employee_id=emp.id, organization_id=org.id, month=m, year=2025,
            status="paid", gross_salary=50000, basic_salary=30000, tds_deduction=500,
            pf_deduction=1800, total_deductions=3000, net_salary=47000,
        ))
    db_session.flush()
    data = get_form16_data(db_session, emp.id, "2025-26")
    assert data["financial_year"] == "2025-26"
    assert data["months_paid"] == 3
    assert abs(data["totals"]["tds"] - 1500) < 0.01
    assert abs(data["totals"]["gross"] - 150000) < 0.01
    assert data["organization"]["tan_no"] == "BLRZ12345A"
    assert data["computation"]["total_income"] >= 0
    pdf = generate_form16_pdf(db_session, emp.id, "2025-26")
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 1000


def test_form16_totals_tds_over_fy(db_session):
    """TDS in Form 16 = sum of every payroll's tds in the Apr–Mar financial year only."""
    from services.form16_service import get_form16_data
    org, emp = _mk(db_session)
    # In FY window (Apr 2025..Mar 2026)
    db_session.add(Payroll(employee_id=emp.id, organization_id=org.id, month=12, year=2025,
                           status="paid", gross_salary=50000, tds_deduction=700, total_deductions=1000, net_salary=49000))
    # Outside window (Mar 2025 belongs to FY 2024-25; Apr 2026 to FY 2026-27)
    db_session.add(Payroll(employee_id=emp.id, organization_id=org.id, month=3, year=2025,
                           status="paid", gross_salary=50000, tds_deduction=900, total_deductions=1000, net_salary=49000))
    db_session.add(Payroll(employee_id=emp.id, organization_id=org.id, month=4, year=2026,
                           status="paid", gross_salary=50000, tds_deduction=900, total_deductions=1000, net_salary=49000))
    db_session.flush()
    data = get_form16_data(db_session, emp.id, "2025-26")
    assert data["months_paid"] == 1
    assert abs(data["totals"]["tds"] - 700) < 0.01


def test_form16_not_issued_when_no_tds(client, db_session, admin_token):
    """No TDS deducted in the FY -> endpoint returns a Salary/Service Certificate, not Form 16."""
    from models import User
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    org, emp = _mk(db_session)
    emp.organization_id = admin.organization_id
    org.tan_no = "BLRZ12345A"
    org.pan_no = "ABCDE1234F"
    db_session.flush()
    # Paid payrolls with zero TDS
    db_session.add(Payroll(employee_id=emp.id, organization_id=admin.organization_id, month=4, year=2025,
                           status="paid", gross_salary=50000, tds_deduction=0, total_deductions=1000, net_salary=49000))
    db_session.flush()
    r = client.get("/api/payroll/form16/{}?financial_year=2025-26".format(emp.id),
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.headers.get("x-document-type") == "salary-certificate"
    assert "salary_certificate" in r.headers.get("content-disposition", "")


def test_form16_requires_registered_tan_pan(client, db_session, admin_token):
    """TDS deducted but no registered TAN/PAN on the org -> request refused with guidance."""
    from models import User
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    org, emp = _mk(db_session)
    emp.organization_id = admin.organization_id
    org.tan_no = None
    org.pan_no = None
    db_session.flush()
    db_session.add(Payroll(employee_id=emp.id, organization_id=admin.organization_id, month=4, year=2025,
                           status="paid", gross_salary=50000, tds_deduction=1000, total_deductions=1000, net_salary=49000))
    db_session.flush()
    r = client.get("/api/payroll/form16/{}?financial_year=2025-26".format(emp.id),
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 400
    assert "TAN/PAN" in r.json().get("detail", "")
    assert "TRACES" in r.json().get("detail", "")


def test_payslip_email_endpoint(client, db_session, admin_token):
    """POST /api/payroll/{id}/email returns a message even when delivery is logged."""
    from models import User
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    org, emp = _mk(db_session)
    emp.organization_id = admin.organization_id
    emp.email = "pc@example.com"
    db_session.flush()
    p = Payroll(employee_id=emp.id, organization_id=admin.organization_id, month=6, year=2026,
                status="paid", gross_salary=50000, net_salary=47000, total_deductions=3000)
    db_session.add(p); db_session.flush()
    r = client.post(f"/api/payroll/{p.id}/email", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert "Payslip" in r.json().get("message", "")


def test_bulk_salary_revision(client, db_session, admin_token):
    """Bulk revision raises all listed employees' CTCs by the given percent."""
    from models import User
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    org, e1 = _mk(db_session)
    e1.organization_id = admin.organization_id
    e2 = Employee(first_name="Two", last_name="User", email="two@example.com", employee_code="PC002",
                  organization_id=admin.organization_id, base_salary=300000, status="active", join_date=datetime(2021, 1, 1))
    db_session.add(e2); db_session.flush()
    r = client.post("/api/payroll/salary-revisions/bulk", json={
        "employeeIds": [e1.id, e2.id], "effectiveFrom": "2026-04-01",
        "hikePercent": 10, "reason": "Annual hike",
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    body = r.json()
    assert len(body["updated"]) == 2
    db_session.refresh(e1); db_session.refresh(e2)
    assert abs(e1.base_salary - 660000) < 0.01  # 600000 * 1.10
    assert abs(e2.base_salary - 330000) < 0.01


def test_employee_list_masks_pii_for_employee_role(client, db_session, admin_token):
    """Non-HR users get blanked PAN/bank/salary fields in the employee list."""
    from database import get_read_db
    from main import app

    def override_read_db():
        yield db_session
    app.dependency_overrides[get_read_db] = override_read_db
    try:
        org, emp = _mk(db_session)
        from models import Company
        co = Company(name="PC Co", organization_id=org.id, status="active")
        db_session.add(co)
        db_session.flush()
        emp.company_id = co.id
        emp.pan_number = "ABCDE1234F"
        emp.bank_account_number = "987654321"
        emp.base_salary = 600000
        emp2 = Employee(first_name="Other", last_name="Colleague", email="other@example.com", employee_code="PC099",
                        organization_id=org.id, company_id=co.id, base_salary=500000, status="active", join_date=datetime(2020, 1, 1),
                        pan_number="ZZZZZ9999Z", bank_account_number="111222333")
        db_session.add(emp2)
        db_session.flush()
        # A plain employee user in the same org
        from core.auth import get_password_hash
        from models import User
        u = User(email="staff@example.com", full_name="Staff", role="employee",
                 organization_id=org.id, password_hash=get_password_hash("pw123"))
        db_session.add(u); db_session.flush()
        emp.user_id = u.id
        db_session.flush()
        login = client.post("/api/auth/login", json={"email": "staff@example.com", "password": "pw123"})
        assert login.status_code == 200
        token = login.json()["token"]
        r = client.get("/api/employees", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        body = r.json()
        recs = body.get("data", []) if isinstance(body, dict) else body
        me = next((x for x in recs if x.get("id") == emp.id), None)
        other = next((x for x in recs if x.get("id") == emp2.id), None)
        assert me is not None and other is not None
        # Own record stays unmasked (self-service profile keeps working)
        assert me.get("panNumber") == "ABCDE1234F"
        assert me.get("bankAccountNumber") == "987654321"
        assert me.get("baseSalary") == 600000
        # Other employees' sensitive fields are blanked
        assert other.get("panNumber") in (None, "")
        assert other.get("bankAccountNumber") in (None, "")
        assert other.get("baseSalary") in (None, 0)
    finally:
        app.dependency_overrides.pop(get_read_db, None)


def test_bulk_form16_export_zip(client, db_session, admin_token):
    """Bulk export returns a ZIP with the Form 16 (Part B) PDF and a manifest."""
    import io as _io
    import zipfile
    from models import User, Organization
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    org, emp = _mk(db_session)
    emp.organization_id = admin.organization_id
    admin_org = db_session.query(Organization).filter(Organization.id == admin.organization_id).first()
    admin_org.tan_no = "BLRZ12345A"
    admin_org.pan_no = "ABCDE1234F"
    db_session.flush()
    db_session.add(Payroll(employee_id=emp.id, organization_id=admin.organization_id, month=4, year=2025,
                           status="paid", gross_salary=50000, tds_deduction=1000, total_deductions=1000, net_salary=49000))
    db_session.flush()
    r = client.get("/api/payroll/form16/bulk?financial_year=2025-26",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/zip")
    zf = zipfile.ZipFile(_io.BytesIO(r.content))
    names = zf.namelist()
    assert any(n.startswith("form16_") and n.endswith(".pdf") for n in names), names
    assert "manifest.csv" in names
    manifest = zf.read("manifest.csv").decode()
    assert "PC001" in manifest
    assert "included" in manifest


def test_bulk_form16_skips_ineligible(client, db_session, admin_token):
    """Employees with no TDS are listed as skipped (no Form 16) with the reason."""
    import io as _io
    import zipfile
    from models import User
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    org, emp = _mk(db_session)
    emp.organization_id = admin.organization_id
    org.tan_no = "BLRZ12345A"
    org.pan_no = "ABCDE1234F"
    db_session.flush()
    db_session.add(Payroll(employee_id=emp.id, organization_id=admin.organization_id, month=4, year=2025,
                           status="paid", gross_salary=50000, tds_deduction=0, total_deductions=1000, net_salary=49000))
    db_session.flush()
    r = client.get("/api/payroll/form16/bulk?financial_year=2025-26",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    zf = zipfile.ZipFile(_io.BytesIO(r.content))
    assert not any(n.startswith("form16_") and n.endswith(".pdf") for n in zf.namelist())
    manifest = zf.read("manifest.csv").decode()
    assert "skipped" in manifest
    assert "No TDS" in manifest


def test_bulk_email_payslips(client, db_session, admin_token):
    """Bulk email endpoint emails every listed payroll that has an employee email."""
    from models import User
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    org, e1 = _mk(db_session)
    e1.organization_id = admin.organization_id
    e1.email = "one@example.com"
    e2 = Employee(first_name="Two", last_name="User", email="two@example.com", employee_code="PC002",
                  organization_id=admin.organization_id, base_salary=300000, status="active", join_date=datetime(2021, 1, 1))
    db_session.add(e2); db_session.flush()
    p1 = Payroll(employee_id=e1.id, organization_id=admin.organization_id, month=6, year=2026,
                 status="paid", gross_salary=50000, net_salary=47000, total_deductions=3000)
    p2 = Payroll(employee_id=e2.id, organization_id=admin.organization_id, month=6, year=2026,
                 status="paid", gross_salary=30000, net_salary=28000, total_deductions=2000)
    db_session.add(p1); db_session.add(p2); db_session.flush()
    r = client.post("/api/payroll/bulk-email", json={"payrollIds": [p1.id, p2.id]},
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    body = r.json()
    assert len(body["emailed"]) == 2
    assert body["total"] == 2


def test_state_slab_db_override(db_session):
    """Effective-dated DB PT slab wins over the static table when a DB row exists."""
    from datetime import date
    from models import StatePTSlab
    from services.compliance_engine import calculate_professional_tax
    # Baseline: static Karnataka slab -> 200 for gross 50000
    assert calculate_professional_tax(50000, "karnataka")["amount"] == 200
    # Insert a custom effective-dated slab with a different amount
    db_session.add(StatePTSlab(
        state_code="karnataka", state_name="Karnataka",
        from_gross=0, to_gross=None, amount=321.0,
        effective_from=date(2025, 1, 1), effective_to=None, source="custom",
    ))
    db_session.flush()
    result = calculate_professional_tax(50000, "karnataka", db=db_session, as_of=date(2025, 6, 1))
    assert result["amount"] == 321.0
    assert result.get("source") == "db"
    # Before the effective date the DB row does not apply -> static fallback
    before = calculate_professional_tax(50000, "karnataka", db=db_session, as_of=date(2024, 6, 1))
    assert before["amount"] == 200
    assert before.get("source") == "static"
