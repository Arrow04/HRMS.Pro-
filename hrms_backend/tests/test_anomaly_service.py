"""Tests for anomaly detection engine — buddy punching, payroll drift, OT, duplicate bank."""

from datetime import datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from models import Attendance, Employee, Organization, Payroll, User
from services.anomaly_service import (
    _count_consecutive_ot_days,
    detect_buddy_punching,
    detect_duplicate_bank_accounts,
    detect_overtime_anomalies,
    detect_payroll_drift,
    run_full_scan,
)


@pytest.fixture
def org(db_session: Session) -> Organization:
    org = Organization(name="Test Org for Anomalies", code="ANOMALY")
    db_session.add(org)
    db_session.flush()
    return org


@pytest.fixture
def employees(org: Organization, db_session: Session) -> list[Employee]:
    emps = []
    for i in range(5):
        emp = Employee(
            first_name=f"Test{i}",
            last_name=f"User{i}",
            email=f"anomaly_test{i}@example.com",
            employee_code=f"ANOM{i:03d}",
            organization_id=org.id,
            base_salary=30000 + i * 5000,
            status="active",
            bank_account_number=f"000000{i:04d}" if i < 4 else "9999999999",
        )
        db_session.add(emp)
        emps.append(emp)
    db_session.flush()
    return emps


@pytest.fixture
def payroll_records(org: Organization, employees: list[Employee], db_session: Session) -> list[Payroll]:
    records = []
    base_nets = [30000, 35000, 40000, 45000, 50000]
    for emp, net in zip(employees, base_nets):
        p = Payroll(
            employee_id=emp.id,
            organization_id=org.id,
            month=5,
            year=2026,
            basic_salary=net * 0.5,
            net_salary=net,
            gross_salary=net * 1.2,
            total_deductions=net * 0.2,
            status="processed",
        )
        db_session.add(p)
        records.append(p)
    db_session.flush()
    return records


class TestCountConsecutiveOTDays:
    def test_no_records(self):
        assert _count_consecutive_ot_days([]) == 0

    def test_single_record(self):
        from models import Attendance
        att = Attendance(date=datetime(2026, 6, 1))
        assert _count_consecutive_ot_days([att]) == 1

    def test_consecutive_days(self):
        from models import Attendance
        records = [
            Attendance(date=datetime(2026, 6, 1)),
            Attendance(date=datetime(2026, 6, 2)),
            Attendance(date=datetime(2026, 6, 3)),
        ]
        assert _count_consecutive_ot_days(records) == 3

    def test_gap_breaks_streak(self):
        from models import Attendance
        records = [
            Attendance(date=datetime(2026, 6, 1)),
            Attendance(date=datetime(2026, 6, 2)),
            Attendance(date=datetime(2026, 6, 5)),
            Attendance(date=datetime(2026, 6, 6)),
        ]
        assert _count_consecutive_ot_days(records) == 2

    def test_duplicate_dates(self):
        from models import Attendance
        records = [
            Attendance(date=datetime(2026, 6, 1)),
            Attendance(date=datetime(2026, 6, 1)),
            Attendance(date=datetime(2026, 6, 2)),
        ]
        assert _count_consecutive_ot_days(records) == 2


class TestDetectBuddyPunching:
    def test_no_attendance_records(self, org, db_session):
        results = detect_buddy_punching(db_session, org.id)
        assert results == []

    def test_single_employee_no_flag(self, org, employees, db_session):
        now = datetime.utcnow()
        att = Attendance(
            employee_id=employees[0].id,
            organization_id=org.id,
            date=now,
            check_in=now,
            check_in_latitude=12.9716,
            check_in_longitude=77.5946,
            status="present",
        )
        db_session.add(att)
        db_session.flush()
        results = detect_buddy_punching(db_session, org.id)
        assert results == []

    def test_two_employees_same_time_location(self, org, employees, db_session):
        now = datetime.utcnow()
        for i in range(2):
            att = Attendance(
                employee_id=employees[i].id,
                organization_id=org.id,
                date=now,
                check_in=now,
                check_in_latitude=12.9716,
                check_in_longitude=77.5946,
                status="present",
            )
            db_session.add(att)
        db_session.flush()
        results = detect_buddy_punching(db_session, org.id)
        assert len(results) >= 1
        assert results[0]["type"] == "buddy_punching"

    def test_different_locations_no_flag(self, org, employees, db_session):
        now = datetime.utcnow()
        for i in range(2):
            att = Attendance(
                employee_id=employees[i].id,
                organization_id=org.id,
                date=now,
                check_in=now,
                check_in_latitude=12.9716 + i * 0.1,
                check_in_longitude=77.5946 + i * 0.1,
                status="present",
            )
            db_session.add(att)
        db_session.flush()
        results = detect_buddy_punching(db_session, org.id)
        buddy = [r for r in results if r["type"] == "buddy_punching"]
        assert len(buddy) == 0


class TestDetectPayrollDrift:
    def test_no_current_payroll(self, org, db_session):
        results = detect_payroll_drift(db_session, org.id, month=1, year=2020)
        assert results == []

    def test_no_drift(self, org, employees, db_session):
        for emp in employees:
            for m in [4, 5]:
                p = Payroll(
                    employee_id=emp.id,
                    organization_id=org.id,
                    month=m,
                    year=2026,
                    net_salary=40000,
                    basic_salary=20000,
                    gross_salary=50000,
                    total_deductions=10000,
                    status="processed",
                )
                db_session.add(p)
        db_session.flush()
        results = detect_payroll_drift(db_session, org.id, month=5, year=2026)
        drifts = [r for r in results if r["type"] == "payroll_drift"]
        assert len(drifts) == 0

    def test_significant_drift_flagged(self, org, employees, db_session):
        for emp in employees:
            db_session.add(Payroll(
                employee_id=emp.id, organization_id=org.id,
                month=4, year=2026, net_salary=30000, basic_salary=15000,
                gross_salary=40000, total_deductions=10000, status="processed",
            ))
            db_session.add(Payroll(
                employee_id=emp.id, organization_id=org.id,
                month=5, year=2026, net_salary=50000, basic_salary=25000,
                gross_salary=65000, total_deductions=15000, status="processed",
            ))
        db_session.flush()
        results = detect_payroll_drift(db_session, org.id, month=5, year=2026)
        drifts = [r for r in results if r["type"] == "payroll_drift"]
        change_pct = abs((50000 - 30000) / 30000 * 100)
        assert len(drifts) == len(employees)
        assert drifts[0]["severity"] == ("critical" if change_pct > 50 else "high" if change_pct > 30 else "medium")


class TestDetectOvertimeAnomalies:
    def test_no_overtime_records(self, org, employees, db_session):
        now = datetime.utcnow()
        for emp in employees[:2]:
            db_session.add(Attendance(
                employee_id=emp.id, organization_id=org.id,
                date=now, overtime_hours=0, status="present",
            ))
        db_session.flush()
        results = detect_overtime_anomalies(db_session, org.id, month=now.month, year=now.year)
        ot = [r for r in results if r["type"] == "overtime_anomaly"]
        assert len(ot) == 0

    def test_excessive_daily_ot(self, org, employees, db_session):
        now = datetime.utcnow()
        emp = employees[0]
        for day in range(5):
            db_session.add(Attendance(
                employee_id=emp.id, organization_id=org.id,
                date=datetime(now.year, now.month, day + 1),
                overtime_hours=5.0, status="present",
            ))
        db_session.flush()
        results = detect_overtime_anomalies(db_session, org.id, month=now.month, year=now.year)
        ot = [r for r in results if r["type"] == "overtime_anomaly"]
        assert len(ot) >= 1
        assert "ot" in ot[0]["title"].lower()

    def test_excessive_monthly_ot(self, org, employees, db_session):
        now = datetime.utcnow()
        emp = employees[0]
        for day in range(1, 25):
            db_session.add(Attendance(
                employee_id=emp.id, organization_id=org.id,
                date=datetime(now.year, now.month, day),
                overtime_hours=3.0, status="present",
            ))
        db_session.flush()
        results = detect_overtime_anomalies(db_session, org.id, month=now.month, year=now.year)
        ot = [r for r in results if r["type"] == "overtime_anomaly"]
        assert len(ot) >= 1


class TestDetectDuplicateBankAccounts:
    def test_no_duplicates(self, org, employees, db_session):
        employees[0].bank_account_number = "1111111111"
        employees[1].bank_account_number = "2222222222"
        employees[2].bank_account_number = "3333333333"
        db_session.flush()
        results = detect_duplicate_bank_accounts(db_session, org.id)
        dupes = [r for r in results if r["type"] == "duplicate_bank"]
        assert len(dupes) == 0

    def test_two_employees_shared_account(self, org, employees, db_session):
        employees[0].bank_account_number = "9999999999"
        employees[1].bank_account_number = "9999999999"
        db_session.flush()
        results = detect_duplicate_bank_accounts(db_session, org.id)
        dupes = [r for r in results if r["type"] == "duplicate_bank"]
        assert len(dupes) >= 1
        assert len(dupes[0]["employee_ids"]) >= 2

    def test_inactive_employees_excluded(self, org, employees, db_session):
        employees[0].bank_account_number = "8888888888"
        employees[0].status = "terminated"
        employees[1].bank_account_number = "8888888888"
        employees[1].status = "terminated"
        db_session.flush()
        results = detect_duplicate_bank_accounts(db_session, org.id)
        dupes = [r for r in results if r["type"] == "duplicate_bank"]
        assert len(dupes) == 0


class TestRunFullScan:
    def test_full_scan_empty(self, org, db_session):
        summary = run_full_scan(db_session, org.id)
        assert "scanned_at" in summary
        assert summary["detected"] == 0
        assert summary["new_alerts"] == 0

    def test_full_scan_with_duplicate_banks(self, org, employees, db_session):
        employees[0].bank_account_number = "7777777777"
        employees[1].bank_account_number = "7777777777"
        db_session.flush()
        summary = run_full_scan(db_session, org.id)
        assert summary["detected"] >= 1
        assert summary["new_alerts"] >= 1
        assert summary["by_type"].get("duplicate_bank", 0) >= 1

    def test_scan_deduplication(self, org, employees, db_session):
        employees[0].bank_account_number = "6666666666"
        employees[1].bank_account_number = "6666666666"
        db_session.flush()
        summary1 = run_full_scan(db_session, org.id)
        assert summary1["new_alerts"] >= 1
        summary2 = run_full_scan(db_session, org.id)
        assert summary2["new_alerts"] == 0
