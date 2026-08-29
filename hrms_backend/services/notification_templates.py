"""
Email & WhatsApp notification templates for all HR workflows.
Production-ready HTML templates matching Indian HRMS standards.
"""
from datetime import datetime


def template_wrapper(title: str, body_html: str) -> str:
    from services.email_service import brand_header
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<style>
  body {{ font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f4f6f9; }}
  .container {{ max-width: 600px; margin: 20px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }}
  .body {{ padding: 32px 40px; color: #333; line-height: 1.7; font-size: 15px; }}
  .body h2 {{ font-size: 18px; color: #1a237e; margin: 0 0 16px; }}
  .info-row {{ display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }}
  .info-row .label {{ color: #666; font-weight: 500; }}
  .info-row .value {{ color: #111; font-weight: 600; }}
  .cta {{ display: inline-block; padding: 12px 32px; background: #1a237e; color: #fff !important; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 16px 0; }}
  .footer {{ background: #f8f9fa; padding: 20px 40px; font-size: 12px; color: #888; text-align: center; }}
  .footer a {{ color: #1a237e; text-decoration: none; }}
  .badge {{ display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }}
  .badge-success {{ background: #e8f5e9; color: #2e7d32; }}
  .badge-warning {{ background: #fff3e0; color: #e65100; }}
  .badge-info {{ background: #e3f2fd; color: #1565c0; }}
</style></head><body>
<div class="container">
  {brand_header(title)}
  <div class="body">{body_html}</div>
  <div class="footer">
    <p><strong>HRMS.Pro!</strong> — here and ready to serve every human resource management need.</p>
    <p>HRMS.Pro! — <a href="mailto:support@hrmspro.com">support@hrmspro.com</a></p>
    <p>© {datetime.utcnow().year} HRMS.Pro!. All rights reserved.</p>
  </div>
</div></body></html>"""


def payslip_notification(employee_name: str, month: int, year: int, net_salary: float, download_link: str) -> str:
    months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    body = f"""
    <h2>Payslip Generated — {months[month-1]} {year}</h2>
    <p>Dear {employee_name},</p>
    <p>Your payslip for <strong>{months[month-1]} {year}</strong> has been generated.</p>
    <div class="info-row"><span class="label">Net Salary</span><span class="value">₹{net_salary:,.2f}</span></div>
    <div class="info-row"><span class="label">Month</span><span class="value">{months[month-1]} {year}</span></div>
    <div style="margin-top:24px"><a href="{download_link}" class="cta">Download Payslip</a></div>
    <p style="margin-top:16px;color:#666;font-size:13px;">
      You can also view all your payslips from the HRMS portal under Payroll &gt; Payslips.
    </p>"""
    return template_wrapper("Payslip Generated", body)


def leave_approved_notification(employee_name: str, leave_type: str, start_date: str, end_date: str, days: int, approver: str) -> str:
    body = f"""
    <h2>Leave Approved</h2>
    <p>Dear {employee_name},</p>
    <p>Your leave request has been <span class="badge badge-success">Approved</span> by {approver}.</p>
    <div class="info-row"><span class="label">Leave Type</span><span class="value">{leave_type}</span></div>
    <div class="info-row"><span class="label">Duration</span><span class="value">{start_date} to {end_date}</span></div>
    <div class="info-row"><span class="label">Days</span><span class="value">{days}</span></div>"""
    return template_wrapper("Leave Approved", body)


def leave_rejected_notification(employee_name: str, leave_type: str, start_date: str, days: int, reason: str) -> str:
    body = f"""
    <h2>Leave Request Update</h2>
    <p>Dear {employee_name},</p>
    <p>Your leave request for <strong>{leave_type}</strong> starting {start_date} has been <span class="badge badge-warning">Rejected</span>.</p>
    <div class="info-row"><span class="label">Reason</span><span class="value">{reason or 'Not specified'}</span></div>"""
    return template_wrapper("Leave Rejected", body)


def attendance_reminder(employee_name: str, date: str, status: str) -> str:
    body = f"""
    <h2>Attendance Reminder</h2>
    <p>Dear {employee_name},</p>
    <p>Your attendance for <strong>{date}</strong> is marked as <span class="badge badge-warning">{status}</span>.</p>
    <p>If this is incorrect, please contact your manager or HR to rectify it within the payroll cutoff.</p>"""
    return template_wrapper("Attendance Reminder", body)


def offer_letter_email(employee_name: str, designation: str, join_date: str, offer_link: str) -> str:
    body = f"""
    <h2>Congratulations! You're Hired 🎉</h2>
    <p>Dear {employee_name},</p>
    <p>We are delighted to offer you the position of <strong>{designation}</strong>.</p>
    <p>Your expected date of joining is <strong>{join_date}</strong>.</p>
    <div style="margin-top:24px"><a href="{offer_link}" class="cta">View & Accept Offer Letter</a></div>
    <p style="margin-top:16px;color:#666;font-size:13px;">Please review and accept the offer letter at your earliest convenience.</p>"""
    return template_wrapper("Offer Letter", body)


def onboarding_welcome(employee_name: str, department: str, manager_name: str) -> str:
    body = f"""
    <h2>Welcome to the Team! 🎉</h2>
    <p>Dear {employee_name},</p>
    <p>Welcome to the company! We're excited to have you on board.</p>
    <div class="info-row"><span class="label">Department</span><span class="value">{department}</span></div>
    <div class="info-row"><span class="label">Manager</span><span class="value">{manager_name}</span></div>
    <p style="margin-top:16px;">Your onboarding checklist has been created. Please complete the tasks from the HRMS portal.</p>"""
    return template_wrapper("Welcome Aboard!", body)


def birthday_wish(employee_name: str) -> str:
    body = f"""
    <h2>Happy Birthday! 🎂</h2>
    <p>Dear {employee_name},</p>
    <p>Wishing you a wonderful birthday filled with joy and success!</p>
    <p style="font-size:24px;text-align:center;margin:24px 0;">🎉🎈🎁</p>
    <p style="text-align:center;color:#666;">— Team HRMS Pro</p>"""
    return template_wrapper("Happy Birthday!", body)


def work_anniversary(employee_name: str, years: int) -> str:
    body = f"""
    <h2>Work Anniversary 🏆</h2>
    <p>Dear {employee_name},</p>
    <p>Congratulations on completing <strong>{years} year{'s' if years > 1 else ''}</strong> with us!</p>
    <p>Your dedication and hard work inspire the entire team.</p>
    <p style="text-align:center;color:#666;margin-top:24px;">— Team HRMS Pro</p>"""
    return template_wrapper("Work Anniversary", body)


def compliance_alert(org_name: str, alert_type: str, message: str) -> str:
    body = f"""
    <h2>Compliance Alert</h2>
    <p><strong>{org_name}</strong></p>
    <div class="info-row"><span class="label">Type</span><span class="value"><span class="badge badge-warning">{alert_type}</span></span></div>
    <p style="margin-top:16px;">{message}</p>
    <p style="color:#666;font-size:13px;">Please take necessary action to ensure statutory compliance.</p>"""
    return template_wrapper("Compliance Alert", body)


def tds_deduction_summary(employee_name: str, month: int, year: int, tds_amount: float, ytd_tds: float) -> str:
    months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    body = f"""
    <h2>TDS Deduction — {months[month-1]} {year}</h2>
    <p>Dear {employee_name},</p>
    <p>Your TDS deduction for this month has been processed.</p>
    <div class="info-row"><span class="label">Month</span><span class="value">{months[month-1]} {year}</span></div>
    <div class="info-row"><span class="label">TDS Deducted</span><span class="value">₹{tds_amount:,.2f}</span></div>
    <div class="info-row"><span class="label">Financial Year TDS</span><span class="value">₹{ytd_tds:,.2f}</span></div>"""
    return template_wrapper("TDS Deduction Summary", body)


def tenant_welcome_email(company_name: str, admin_name: str, admin_email: str, login_url: str) -> str:
    body = f"""
    <h2>Welcome to HRMS.Pro! — here and ready to serve you</h2>
    <p>Dear {admin_name},</p>
    <p>Your organisation <strong>{company_name}</strong> has been registered successfully.</p>
    <p>Your account is currently under review. A super admin will review and activate your account shortly.</p>
    <div class="info-row"><span class="label">Company</span><span class="value">{company_name}</span></div>
    <div class="info-row"><span class="label">Admin Email</span><span class="value">{admin_email}</span></div>
    <div class="info-row"><span class="label">Status</span><span class="value"><span class="badge badge-warning">Pending Approval</span></span></div>
    <p style="margin-top: 24px;">You will receive an email once your account is activated.</p>
    <a href="{login_url}" class="cta">Go to Login</a>"""
    return template_wrapper("Welcome to HRMS.Pro!", body)


def tenant_approved_email(company_name: str, admin_name: str, login_url: str) -> str:
    body = f"""
    <h2>Your Organisation Has Been Approved!</h2>
    <p>Dear {admin_name},</p>
    <p>Great news! Your organisation <strong>{company_name}</strong> has been approved and activated.</p>
    <div class="info-row"><span class="label">Status</span><span class="value"><span class="badge badge-success">Active</span></span></div>
    <p style="margin-top: 24px;">You can now log in and start managing your HR operations.</p>
    <a href="{login_url}" class="cta">Login to HRMS.Pro!</a>"""
    return template_wrapper("Organisation Approved", body)


def tenant_rejected_email(company_name: str, admin_name: str, reason: str = "") -> str:
    reason_text = f"<p><strong>Reason:</strong> {reason}</p>" if reason else ""
    body = f"""
    <h2>Registration Update</h2>
    <p>Dear {admin_name},</p>
    <p>We regret to inform you that your organisation <strong>{company_name}</strong> registration could not be approved at this time.</p>
    {reason_text}
    <p>If you believe this is an error, please contact us at <a href="mailto:support@hrmspro.com">support@hrmspro.com</a>.</p>"""
    return template_wrapper("Registration Update", body)


def new_tenant_signup_notification(company_name: str, admin_name: str, admin_email: str, dashboard_url: str) -> str:
    body = f"""
    <h2>New Organisation Registration</h2>
    <p>A new organisation has registered on HRMS Pro.</p>
    <div class="info-row"><span class="label">Organisation</span><span class="value">{company_name}</span></div>
    <div class="info-row"><span class="label">Admin Name</span><span class="value">{admin_name}</span></div>
    <div class="info-row"><span class="label">Admin Email</span><span class="value">{admin_email}</span></div>
    <div class="info-row"><span class="label">Status</span><span class="value"><span class="badge badge-warning">Pending</span></span></div>
    <p style="margin-top: 24px;">Review and approve this organisation from the super admin dashboard.</p>
    <a href="{dashboard_url}" class="cta">Review Registration</a>"""
    return template_wrapper("New Organisation Registration", body)
