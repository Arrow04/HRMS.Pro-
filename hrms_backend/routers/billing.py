"""
Tenant-facing subscription & billing endpoints.

Lets the logged-in tenant admin see their current plan, days until expiry,
available plans, payment history, and record a payment.
"""
from typing import List, Optional
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.auth import get_current_user
from database import get_db
from models import User, Organization, Subscription, Plan, Payment, Invoice
from utils.helpers import convert_camel_to_snake

router = APIRouter(tags=["Billing"])


class PaymentCreate(BaseModel):
    plan_id: int
    amount: float
    currency: Optional[str] = "INR"
    billing_cycle: Optional[str] = "monthly"
    method: Optional[str] = "card"
    transaction_id: Optional[str] = None
    notes: Optional[str] = None


def _get_org(db: Session, current_user: User) -> Organization:
    org = None
    if current_user.organization_id:
        org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    if not org:
        emp = db.query(Organization).first()
        raise HTTPException(status_code=400, detail="No organisation linked to this account")
    return org


def _sub_payload(db: Session, sub: Subscription):
    plan = sub.plan
    now = datetime.utcnow()
    expiry = sub.next_billing_date or sub.trial_ends_at
    days_left = None
    if expiry:
        days_left = max(0, (expiry - now).days)

    # Compute price from the org's active employee count using the configured tiers.
    employee_count = 0
    price = 0.0
    try:
        from models import Employee
        from routers.superadmin import _price_for_employee_count
        employee_count = db.query(Employee).filter(
            Employee.organization_id == sub.organization_id,
            Employee.deleted_at.is_(None),
            Employee.status == "active",
        ).count()
        price = _price_for_employee_count(db, employee_count)
    except Exception:
        pass

    return {
        "id": sub.id,
        "status": sub.status,
        "billing_cycle": sub.billing_cycle,
        "next_billing_date": sub.next_billing_date.isoformat() if sub.next_billing_date else None,
        "trial_ends_at": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
        "days_left": days_left,
        "expiry_date": expiry.isoformat() if expiry else None,
        "employee_count": employee_count,
        "price": price,
        "plan": {
            "id": plan.id if plan else None,
            "name": plan.name if plan else "free",
            "display_name": plan.display_name if plan else "Free Trial",
            "price_monthly": plan.price_monthly if plan else 0,
            "price_yearly": plan.price_yearly if plan else 0,
            "max_employees": plan.max_employees if plan else 10,
            "features": plan.features if plan else [],
        },
    }


@router.get("/api/billing/subscription", response_model=dict)
def get_my_subscription(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the current tenant's subscription and plan."""
    org = _get_org(db, current_user)
    sub = db.query(Subscription).filter(
        Subscription.organization_id == org.id,
        Subscription.deleted_at.is_(None),
    ).first()

    if not sub:
        # Fall back to the cheapest/any active plan if no "free" plan exists
        plan = db.query(Plan).filter(Plan.name == "free").first()
        if not plan:
            plan = db.query(Plan).filter(Plan.is_active == True).order_by(Plan.price_monthly.asc()).first()  # noqa: E712
        if not plan:
            raise HTTPException(status_code=500, detail="No plan configured. Contact support.")
        try:
            from routers.superadmin import _get_billing_config
            cfg = _get_billing_config(db)
            trial_days = int(cfg.get("trial_days", 14))
        except Exception:
            trial_days = 14
        sub = Subscription(
            organization_id=org.id,
            plan_id=plan.id,
            status="trial",
            trial_ends_at=datetime.utcnow() + timedelta(days=trial_days),
        )
        db.add(sub)
        db.commit()
        db.refresh(sub)

    return _sub_payload(db, sub)


@router.get("/api/billing/plans", response_model=List[dict])
def get_available_plans(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List active plans the tenant can subscribe to."""
    plans = db.query(Plan).filter(Plan.is_active == True).all()  # noqa: E712
    return [
        {
            "id": p.id,
            "name": p.name,
            "display_name": p.display_name,
            "price_monthly": p.price_monthly,
            "price_yearly": p.price_yearly,
            "max_employees": p.max_employees,
            "features": p.features or [],
        }
        for p in plans
    ]


@router.post("/api/billing/payments", response_model=dict)
def create_payment(
    data: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record a payment for the tenant's subscription."""
    org = _get_org(db, current_user)
    plan = db.query(Plan).filter(Plan.id == data.plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    sub = db.query(Subscription).filter(
        Subscription.organization_id == org.id,
        Subscription.deleted_at.is_(None),
    ).first()
    if not sub:
        sub = Subscription(
            organization_id=org.id,
            plan_id=plan.id,
            status="active",
            billing_cycle=data.billing_cycle or "monthly",
        )
        db.add(sub)
        db.flush()
    else:
        sub.plan_id = plan.id
        sub.status = "active"
        sub.billing_cycle = data.billing_cycle or sub.billing_cycle

    # Extend next billing date
    cycle_days = 365 if (data.billing_cycle or sub.billing_cycle) == "yearly" else 30
    now = datetime.utcnow()
    base = sub.next_billing_date or now
    sub.next_billing_date = base + timedelta(days=cycle_days)
    sub.trial_ends_at = None
    sub.updated_at = now

    payment = Payment(
        organization_id=org.id,
        plan_id=plan.id,
        amount=data.amount,
        currency=data.currency or "INR",
        billing_cycle=data.billing_cycle or "monthly",
        method=data.method or "card",
        status="completed",
        transaction_id=data.transaction_id or f"TXN{int(now.timestamp())}",
        payment_date=now,
        notes=data.notes,
    )
    db.add(payment)
    db.flush()

    # Read billing config for tax + invoice prefix
    try:
        from routers.superadmin import _get_billing_config
        cfg = _get_billing_config(db)
        tax_percent = float(cfg.get("tax_percent", 0) or 0)
        tax_label = cfg.get("tax_label", "GST") or "GST"
        invoice_prefix = cfg.get("invoice_prefix", "INV") or "INV"
    except Exception:
        tax_percent = 0.0
        tax_label = "GST"
        invoice_prefix = "INV"

    subtotal = float(data.amount or 0)
    tax_amount = round(subtotal * tax_percent / 100, 2)
    total = round(subtotal + tax_amount, 2)
    invoice_number = f"{invoice_prefix}-{org.id}-{now.strftime('%Y%m%d')}-{payment.id}"
    due_days = 30 if (data.billing_cycle or sub.billing_cycle) == "yearly" else 15

    invoice = Invoice(
        invoice_number=invoice_number,
        organization_id=org.id,
        payment_id=payment.id,
        plan_name=plan.display_name,
        billing_cycle=data.billing_cycle or "monthly",
        subtotal=subtotal,
        tax_percent=tax_percent,
        tax_amount=tax_amount,
        tax_label=tax_label,
        total=total,
        currency=data.currency or "INR",
        status="paid",
        issued_date=now,
        due_date=now + timedelta(days=due_days),
        paid_date=now,
        billing_address=org.address or org.name or "",
        notes=data.notes,
    )
    db.add(invoice)
    db.commit()
    db.refresh(payment)
    db.refresh(invoice)

    return {
        "message": "Payment recorded successfully",
        "payment_id": payment.id,
        "transaction_id": payment.transaction_id,
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "invoice_total": total,
        "subscription": _sub_payload(db, sub),
    }


@router.get("/api/billing/payments", response_model=List[dict])
def get_payment_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the tenant's payment history."""
    org = _get_org(db, current_user)
    payments = db.query(Payment).filter(
        Payment.organization_id == org.id,
    ).order_by(Payment.payment_date.desc()).limit(50).all()

    return [
        {
            "id": p.id,
            "amount": p.amount,
            "currency": p.currency,
            "billing_cycle": p.billing_cycle,
            "method": p.method,
            "status": p.status,
            "transaction_id": p.transaction_id,
            "payment_date": p.payment_date.isoformat() if p.payment_date else None,
            "plan_name": p.plan.display_name if p.plan else None,
        }
        for p in payments
    ]


@router.get("/api/billing/invoices", response_model=List[dict])
def get_invoices(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the tenant's invoices."""
    org = _get_org(db, current_user)
    invoices = db.query(Invoice).filter(
        Invoice.organization_id == org.id,
    ).order_by(Invoice.issued_date.desc()).limit(50).all()

    return [
        {
            "id": inv.id,
            "invoice_number": inv.invoice_number,
            "plan_name": inv.plan_name,
            "billing_cycle": inv.billing_cycle,
            "subtotal": inv.subtotal,
            "tax_percent": inv.tax_percent,
            "tax_amount": inv.tax_amount,
            "tax_label": inv.tax_label,
            "total": inv.total,
            "currency": inv.currency,
            "status": inv.status,
            "issued_date": inv.issued_date.isoformat() if inv.issued_date else None,
            "due_date": inv.due_date.isoformat() if inv.due_date else None,
            "paid_date": inv.paid_date.isoformat() if inv.paid_date else None,
        }
        for inv in invoices
    ]


@router.get("/api/billing/invoices/{invoice_id}/pdf")
def get_invoice_pdf(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate and return an invoice as a PDF."""
    from io import BytesIO

    org = _get_org(db, current_user)
    inv = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.organization_id == org.id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Re-serve stored file if present
    if inv.pdf_path:
        import os as _os
        if _os.path.exists(inv.pdf_path):
            with open(inv.pdf_path, "rb") as f:
                data = f.read()
            from fastapi.responses import Response
            return Response(
                content=data,
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{inv.invoice_number}.pdf"'},
            )

    # Build a proper, readable invoice PDF with reportlab
    from io import BytesIO
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_RIGHT

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=18*mm, leftMargin=18*mm, topMargin=16*mm, bottomMargin=16*mm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title2', parent=styles['Title'], fontSize=20, textColor=colors.HexColor('#1C64F2'))
    label_style = ParagraphStyle('Label', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#64748B'))
    value_style = ParagraphStyle('Value', parent=styles['Normal'], fontSize=10, textColor=colors.HexColor('#0F172A'))
    right_style = ParagraphStyle('Right', parent=value_style, alignment=TA_RIGHT)

    org_name = org.name or ''
    issued = inv.issued_date.strftime('%d %b %Y') if inv.issued_date else '-'
    due = inv.due_date.strftime('%d %b %Y') if inv.due_date else '-'
    paid = inv.paid_date.strftime('%d %b %Y') if inv.paid_date else '-'
    status_color = colors.HexColor('#059669') if inv.status == 'paid' else colors.HexColor('#D97706')

    story = []
    try:
        import base64 as _b64, io as _io, os as _os
        from reportlab.lib.utils import ImageReader
        from PIL import Image as _PIL
        _path = _os.path.join(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))), 'services', 'logo_b64.txt')
        if _os.path.exists(_path):
            _pil = _PIL.open(_io.BytesIO(_b64.b64decode(open(_path).read().strip()))).convert('RGBA')
            story.append(Image(ImageReader(_pil), width=42 * mm, height=42 * mm))
            story.append(Spacer(1, 6))
    except Exception:
        pass
    story.append(Paragraph('HRMS.Pro!', title_style))
    story.append(Spacer(1, 2))
    story.append(Paragraph('Enterprise Workforce Management', label_style))
    story.append(Spacer(1, 10))

    head = Table(
        [
            [
                Paragraph('TAX INVOICE', ParagraphStyle('hdr', parent=styles['Heading1'], fontSize=16, textColor=colors.HexColor('#1C64F2'))),
                Table(
                    [
                        [Paragraph('Invoice No', label_style), Paragraph(inv.invoice_number or '-', right_style)],
                        [Paragraph('Date', label_style), Paragraph(issued, right_style)],
                        [Paragraph('Due Date', label_style), Paragraph(due, right_style)],
                        [Paragraph('Status', label_style), Paragraph(f'<font color="#059669"><b>{inv.status.upper()}</b></font>' if inv.status == 'paid' else f'<font color="#D97706"><b>{inv.status.upper()}</b></font>', right_style)],
                    ],
                    colWidths=[60 * mm, 70 * mm]
                ),
            ],
        ],
        colWidths=[80 * mm, 130 * mm]
    )
    head.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(head)
    story.append(Spacer(1, 12))

    bill = Table(
        [[Paragraph('BILLED TO', label_style), Paragraph('PAYMENT DETAILS', label_style)],
         [Paragraph(f'<b>{org_name}</b>', value_style),
          Paragraph(f'Plan: <b>{inv.plan_name or "-"}</b>', value_style)],
         [Paragraph(inv.billing_address or '', value_style),
          Paragraph(f'Cycle: {inv.billing_cycle or "-"}', value_style)],
         [Paragraph('', value_style), Paragraph(f'Paid: {paid}', value_style)]],
        colWidths=[105*mm, 105*mm]
    )
    bill.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(bill)
    story.append(Spacer(1, 14))

    rows = [
        [Paragraph('<b>Description</b>', label_style), Paragraph('<b>Details</b>', label_style)],
        ['Subscription', Paragraph(f'{inv.plan_name or "-"} &middot; {inv.billing_cycle or "-"}', value_style)],
        ['', ''],
    ]
    totals = Table(
        [
            [Paragraph('Subtotal', label_style), Paragraph(f'{inv.currency} {inv.subtotal}', right_style)],
            [Paragraph(f'{inv.tax_label} ({inv.tax_percent}%)', label_style), Paragraph(f'{inv.currency} {inv.tax_amount}', right_style)],
            [Paragraph('<b>Total</b>', ParagraphStyle('tl', parent=value_style, fontSize=12, textColor=colors.HexColor('#0F172A'))),
             Paragraph(f'<b>{inv.currency} {inv.total}</b>', ParagraphStyle('tr', parent=right_style, fontSize=12))],
        ],
        colWidths=[105*mm, 105*mm]
    )
    totals.setStyle(TableStyle([
        ('LINEABOVE', (0, 0), (-1, 0), 0.5, colors.HexColor('#E2E8F0')),
        ('LINEABOVE', (0, 2), (-1, 2), 1, colors.HexColor('#1C64F2')),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(totals)
    story.append(Spacer(1, 16))
    story.append(Paragraph(inv.notes or 'Thank you for your business!', label_style))

    doc.build(story)
    pdf_bytes = buf.getvalue()
    buf.close()

    # Cache the generated file
    try:
        import os as _os
        cache_dir = _os.path.join(_os.path.dirname(__file__), '..', 'generated')
        _os.makedirs(cache_dir, exist_ok=True)
        inv.pdf_path = _os.path.join(cache_dir, f"{inv.invoice_number}.pdf")
        with open(inv.pdf_path, "wb") as f:
            f.write(pdf_bytes)
        db.commit()
    except Exception:
        pass

    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{inv.invoice_number}.pdf"'},
    )


@router.get("/api/billing/payment-methods", response_model=dict)
def get_payment_methods(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Expose the payment QR + bank details to tenants for direct payment."""
    try:
        from routers.superadmin import _get_billing_config
        cfg = _get_billing_config(db)
    except Exception:
        cfg = {}

    bank_details = cfg.get("bank_details") or []
    return {
        "qr_code_url": cfg.get("qr_code_url") or "",
        "upi_id": cfg.get("upi_id") or "",
        "currency": cfg.get("currency") or "INR",
        "bank_details": [
            {
                "id": b.get("id"),
                "bank_name": b.get("bank_name"),
                "account_name": b.get("account_name"),
                "account_number": b.get("account_number"),
                "ifsc": b.get("ifsc"),
                "branch": b.get("branch"),
                "upi_id": b.get("upi_id"),
                "is_default": bool(b.get("is_default")),
            }
            for b in bank_details
        ],
    }


import re as _re

_IFSC_RE = _re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")


@router.get("/api/billing/ifsc/{ifsc_code}", response_model=dict)
def validate_ifsc_for_tenant(
    ifsc_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Validate an IFSC code for employee bank details (any authenticated user)."""
    code = (ifsc_code or "").strip().upper()
    if not _IFSC_RE.match(code):
        return {
            "valid": False,
            "format_valid": False,
            "error": "Invalid IFSC format. Expected 11 chars, e.g. HDFC0001234",
        }
    try:
        import httpx
        resp = httpx.get(f"https://ifsc.razorpay.com/{code}", timeout=8)
        if resp.status_code == 200:
            data = resp.json()
            return {
                "valid": True,
                "format_valid": True,
                "bank": data.get("BANK"),
                "branch": data.get("BRANCH"),
                "address": data.get("ADDRESS"),
                "city": data.get("CITY"),
                "state": data.get("STATE"),
                "micr": data.get("MICR"),
            }
        return {"valid": False, "format_valid": True, "error": "IFSC not found in bank records"}
    except Exception:
        return {
            "valid": True,
            "format_valid": True,
            "bank": None,
            "branch": None,
            "offline": True,
            "message": "Format valid; bank lookup unavailable right now",
        }
