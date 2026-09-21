"""
Payroll Pre-flight Validation Engine
====================================
Validates ALL required configuration before payroll runs.
Blocks payroll with clear error messages if config is missing.

This is the quality gate that ensures every company's payroll
runs correctly with no silent failures.
"""
from typing import Any, Dict, List, Optional, Tuple
from datetime import date
from sqlalchemy.orm import Session
from models import (
    Employee, Organization, Company, PayrollTemplate, PayrollPolicy,
    PayrollComponent, AttendancePolicy, StatutorySetting, TaxRegime,
    TaxSlab, StatutoryRule, Holiday, Attendance, LeaveApplication,
)


class PayrollValidationError(Exception):
    """Raised when pre-flight validation fails."""
    def __init__(self, errors: List[Dict[str, Any]], warnings: List[Dict[str, Any]] = None):
        self.errors = errors
        self.warnings = warnings or []
        super().__init__(f"Payroll validation failed: {len(errors)} errors")


class PayrollPreFlight:
    """Validates payroll configuration for a company before running payroll."""

    def __init__(self, db: Session):
        self.db = db
        self.errors: List[Dict[str, Any]] = []
        self.warnings: List[Dict[str, Any]] = []

    def validate_company(
        self,
        organization_id: int,
        company_id: int,
        month: int,
        year: int,
        branch_id: Optional[int] = None,
        department_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Run full pre-flight validation for a company's payroll.

        Returns:
            {
                "valid": bool,
                "errors": [...],
                "warnings": [...],
                "summary": {...},
                "setup_checklist": [...]
            }
        """
        self.errors = []
        self.warnings = []

        # 1. Validate company exists and is active
        company = self._validate_company(organization_id, company_id)
        if not company:
            return self._result()

        # 2. Validate PayrollTemplate exists for this company
        template = self._validate_payroll_template(organization_id, company_id)

        # 3. Validate PayrollPolicy
        policy = self._validate_payroll_policy(organization_id, company_id, template)

        # 4. Validate AttendancePolicy
        att_policy = self._validate_attendance_policy(organization_id, company_id, template)

        # 5. Validate StatutorySetting
        stat_setting = self._validate_statutory_setting(organization_id, company_id, template, company)

        # 6. Validate TaxRegime + TaxSlabs
        tax_regime = self._validate_tax_regime(organization_id, company_id, template)

        # 7. Validate PayrollComponents exist
        components = self._validate_payroll_components(organization_id, policy)

        # 8. Validate employees exist with salary data
        employees = self._validate_employees(organization_id, company_id, branch_id, department_id)

        # 9. Validate attendance data exists for the period
        self._validate_attendance_data(employees, year, month, att_policy)

        # 10. Validate holiday calendar
        self._validate_holidays(organization_id, company_id, year, month)

        # 11. Validate statutory rules (advisory)
        self._validate_statutory_rules(organization_id, company, stat_setting)

        return self._result()

    def _validate_company(self, org_id: int, company_id: int) -> Optional[Company]:
        company = self.db.query(Company).filter(
            Company.id == company_id,
            Company.organization_id == org_id,
            Company.deleted_at.is_(None),
        ).first()
        if not company:
            self.errors.append({
                "type": "company",
                "severity": "critical",
                "message": f"Company {company_id} not found or inactive",
                "fix": "Create the company in Settings > Companies",
            })
            return None
        if getattr(company, 'status', 'active') != 'active':
            self.errors.append({
                "type": "company",
                "severity": "critical",
                "message": f"Company '{company.name}' is not active",
                "fix": "Activate the company in Settings > Companies",
            })
        return company

    def _validate_payroll_template(self, org_id: int, company_id: int) -> Optional[PayrollTemplate]:
        template = self.db.query(PayrollTemplate).filter(
            PayrollTemplate.organization_id == org_id,
            PayrollTemplate.company_id == company_id,
            PayrollTemplate.status == 'active',
            PayrollTemplate.deleted_at.is_(None),
        ).first()
        if not template:
            self.errors.append({
                "type": "payroll_template",
                "severity": "critical",
                "message": "No Payroll Template configured for this company",
                "fix": "Create a Payroll Template for this company in Payroll > Setup > Templates, "
                       "or apply an Industry Template (one-click setup)",
                "company_id": company_id,
            })
        return template

    def _validate_payroll_policy(self, org_id: int, company_id: int, template: Optional[PayrollTemplate]) -> Optional[PayrollPolicy]:
        policy_id = None
        if template and template.payroll_policy_id:
            policy_id = template.payroll_policy_id
        if not policy_id:
            policy = self.db.query(PayrollPolicy).filter(
                PayrollPolicy.organization_id == org_id,
                PayrollPolicy.status == 'active',
            ).first()
            if policy:
                self.warnings.append({
                    "type": "payroll_policy",
                    "severity": "warning",
                    "message": f"Using org-level policy '{policy.name}' — no company-specific policy",
                    "fix": "Create a company-specific Payroll Policy for different pro-ration, rounding, or currency rules",
                })
                return policy
            self.errors.append({
                "type": "payroll_policy",
                "severity": "critical",
                "message": "No Payroll Policy configured",
                "fix": "Create a Payroll Policy in Payroll > Setup > Policies",
            })
            return None
        policy = self.db.query(PayrollPolicy).filter(
            PayrollPolicy.id == policy_id,
            PayrollPolicy.status == 'active',
        ).first()
        if not policy:
            self.errors.append({
                "type": "payroll_policy",
                "severity": "critical",
                "message": f"Payroll Policy {policy_id} not found or inactive",
                "fix": "Re-create or activate the Payroll Policy",
            })
        return policy

    def _validate_attendance_policy(self, org_id: int, company_id: int, template: Optional[PayrollTemplate]) -> Optional[AttendancePolicy]:
        policy_id = None
        if template and template.attendance_policy_id:
            policy_id = template.attendance_policy_id
        if not policy_id:
            # Check company-level
            att_policy = self.db.query(AttendancePolicy).filter(
                AttendancePolicy.organization_id == org_id,
                AttendancePolicy.company_id == company_id,
                AttendancePolicy.status == 'active',
            ).first()
            if att_policy:
                return att_policy
            # Check org default
            att_policy = self.db.query(AttendancePolicy).filter(
                AttendancePolicy.organization_id == org_id,
                AttendancePolicy.status == 'active',
            ).first()
            if att_policy:
                self.warnings.append({
                    "type": "attendance_policy",
                    "severity": "warning",
                    "message": f"Using org-level attendance policy — no company-specific policy. "
                               f"Working days: {att_policy.working_days_per_week}/week",
                    "fix": "Create a company-specific Attendance Policy (e.g., 5-day week for software, 6-day for restaurant)",
                })
                return att_policy
            self.errors.append({
                "type": "attendance_policy",
                "severity": "critical",
                "message": "No Attendance Policy configured — system will default to 6-day week",
                "fix": "Create an Attendance Policy in Settings > Attendance > Policies",
            })
            return None
        return self.db.query(AttendancePolicy).filter(
            AttendancePolicy.id == policy_id,
            AttendancePolicy.status == 'active',
        ).first()

    def _validate_statutory_setting(self, org_id: int, company_id: int,
                                     template: Optional[PayrollTemplate],
                                     company: Company) -> Optional[StatutorySetting]:
        setting = self.db.query(StatutorySetting).filter(
            StatutorySetting.organization_id == org_id,
            StatutorySetting.status == 'active',
        ).first()
        if not setting:
            country = getattr(company, 'country', 'India') or 'India'
            if country.lower() == 'india':
                self.errors.append({
                    "type": "statutory_setting",
                    "severity": "critical",
                    "message": "No Statutory Settings configured for India — PF/ESI/PT will use defaults",
                    "fix": "Configure Statutory Settings in Payroll > Setup > Statutory Settings, "
                           "or click 'Apply Country Preset' to auto-configure India defaults",
                })
            else:
                self.warnings.append({
                    "type": "statutory_setting",
                    "severity": "info",
                    "message": f"No Statutory Settings for {country} — statutory items disabled",
                    "fix": "Configure country-specific statutory settings if applicable",
                })
        return setting

    def _validate_tax_regime(self, org_id: int, company_id: int,
                              template: Optional[PayrollTemplate]) -> Optional[TaxRegime]:
        regime_id = None
        if template and template.tax_regime_id:
            regime_id = template.tax_regime_id
        if not regime_id:
            regime = self.db.query(TaxRegime).filter(
                TaxRegime.organization_id == org_id,
                TaxRegime.is_default.is_(True),
                TaxRegime.is_active.is_(True),
            ).first()
            if regime:
                self.warnings.append({
                    "type": "tax_regime",
                    "severity": "warning",
                    "message": f"Using org-level tax regime '{regime.name}' — no company-specific regime",
                    "fix": "Create a company-specific Tax Regime if different tax rules apply",
                })
                return regime
            self.errors.append({
                "type": "tax_regime",
                "severity": "critical",
                "message": "No Tax Regime configured — TDS will use hardcoded defaults",
                "fix": "Create a Tax Regime with slabs in Payroll > Setup > Tax Configuration",
            })
            return None
        return self.db.query(TaxRegime).filter(
            TaxRegime.id == regime_id,
            TaxRegime.is_active.is_(True),
        ).first()

    def _validate_payroll_components(self, org_id: int, policy: Optional[PayrollPolicy]) -> list:
        if not policy or not policy.id:
            return []
        components = self.db.query(PayrollComponent).filter(
            PayrollComponent.payroll_policy_id == policy.id,
            PayrollComponent.is_active.is_(True),
            PayrollComponent.status == 'active',
        ).all()
        if not components:
            self.errors.append({
                "type": "payroll_components",
                "severity": "critical",
                "message": "No Payroll Components configured — salary breakdown will use defaults",
                "fix": "Create Earnings and Deduction components in Payroll > Setup > Components",
            })
        else:
            # Check for essential components
            comp_types = {c.component_type for c in components}
            earning_names = {c.name.lower() for c in components if c.component_type == 'earning'}
            deduction_names = {c.name.lower() for c in components if c.component_type == 'deduction'}
            if 'basic' not in earning_names and 'basic salary' not in earning_names:
                self.warnings.append({
                    "type": "payroll_components",
                    "severity": "warning",
                    "message": "No 'Basic' earning component found — salary breakdown may be incorrect",
                    "fix": "Add a 'Basic' earning component with percentage or fixed amount",
                })
        return components

    def _validate_employees(self, org_id: int, company_id: int,
                             branch_id: Optional[int], department_id: Optional[int]) -> list:
        q = self.db.query(Employee).filter(
            Employee.organization_id == org_id,
            Employee.company_id == company_id,
            Employee.status == 'active',
            Employee.deleted_at.is_(None),
        )
        if branch_id:
            q = q.filter(Employee.branch_id == branch_id)
        if department_id:
            q = q.filter(Employee.department_id == department_id)
        employees = q.all()
        if not employees:
            self.errors.append({
                "type": "employees",
                "severity": "critical",
                "message": "No active employees found for this company/branch/department",
                "fix": "Add employees or adjust the filter criteria",
            })
            return []
        # Check salary data
        no_salary = [e for e in employees if not e.base_salary or e.base_salary <= 0]
        if no_salary:
            names = ", ".join(f"{e.first_name} {e.last_name}" for e in no_salary[:5])
            suffix = f" and {len(no_salary) - 5} more" if len(no_salary) > 5 else ""
            self.warnings.append({
                "type": "employee_salary",
                "severity": "warning",
                "message": f"{len(no_salary)} employee(s) have no salary configured: {names}{suffix}",
                "fix": "Set base_salary for these employees in Employee Profile > Salary tab",
            })
        return employees

    def _validate_attendance_data(self, employees: list, year: int, month: int,
                                   att_policy: Optional[AttendancePolicy]):
        if not employees:
            return
        from datetime import date as _date
        import calendar
        dim = calendar.monthrange(year, month)[1]
        month_start = _date(year, month, 1)
        month_end = _date(year, month, dim)

        no_attendance = []
        for emp in employees:
            count = self.db.query(Attendance).filter(
                Attendance.employee_id == emp.id,
                Attendance.date >= month_start,
                Attendance.date <= month_end,
                Attendance.deleted_at.is_(None),
            ).count()
            if count == 0:
                no_attendance.append(f"{emp.first_name} {emp.last_name}")

        if no_attendance:
            names = ", ".join(no_attendance[:5])
            suffix = f" and {len(no_attendance) - 5} more" if len(no_attendance) > 5 else ""
            self.errors.append({
                "type": "attendance_data",
                "severity": "critical",
                "message": f"{len(no_attendance)} employee(s) have NO attendance records for {year}-{month:02d}: {names}{suffix}",
                "fix": "Mark attendance manually, or ensure employees have checked in/out, "
                       "or use bulk attendance upload",
            })

    def _validate_holidays(self, org_id: int, company_id: int, year: int, month: int):
        from datetime import date as _date
        import calendar
        dim = calendar.monthrange(year, month)[1]
        month_start = _date(year, month, 1)
        month_end = _date(year, month, dim)

        holidays = self.db.query(Holiday).filter(
            Holiday.deleted_at.is_(None),
            Holiday.date >= month_start,
            Holiday.date <= month_end,
            Holiday.organization_id == org_id,
        ).filter(
            (Holiday.company_id == company_id) | (Holiday.company_id.is_(None))
        ).count()

        if holidays == 0:
            self.warnings.append({
                "type": "holidays",
                "severity": "info",
                "message": f"No holidays configured for {year}-{month:02d}",
                "fix": "Add holidays in Payroll > Holidays (optional, but affects holiday pay)",
            })

    def _validate_statutory_rules(self, org_id: int, company: Company,
                                    stat_setting: Optional[StatutorySetting]):
        country = getattr(company, 'country', 'India') or 'India'
        if country.lower() != 'india':
            return
        from datetime import date as _date
        today = _date.today()
        rules = self.db.query(StatutoryRule).filter(
            StatutoryRule.country == 'India',
            StatutoryRule.organization_id.is_(None),
            StatutoryRule.status == 'active',
            StatutoryRule.effective_from <= today,
            StatutoryRule.deleted_at.is_(None),
        ).count()
        if rules == 0:
            self.warnings.append({
                "type": "statutory_rules",
                "severity": "info",
                "message": "No Indian statutory rules seeded — using StatutorySetting defaults",
                "fix": "Run the statutory rules seed script, or rules will be added automatically",
            })

    def _result(self) -> Dict[str, Any]:
        return {
            "valid": len(self.errors) == 0,
            "errors": self.errors,
            "warnings": self.warnings,
            "summary": {
                "total_errors": len(self.errors),
                "total_warnings": len(self.warnings),
                "critical_errors": len([e for e in self.errors if e.get('severity') == 'critical']),
            },
        }


def run_preflight(
    db: Session,
    organization_id: int,
    company_id: int,
    month: int,
    year: int,
    branch_id: Optional[int] = None,
    department_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Convenience function to run pre-flight validation."""
    validator = PayrollPreFlight(db)
    return validator.validate_company(
        organization_id, company_id, month, year, branch_id, department_id
    )
