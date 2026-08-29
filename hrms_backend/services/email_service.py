"""
Email Service — fully self-hosted, NO third-party providers.

Delivery modes (tried in order):
  1. Direct-to-MX (self-hosted 'sendmail' style — looks up the recipient's
     mail server via DNS and delivers over port 25). No account, no API key,
     no third party. Works in production when the server can send on port 25.
  2. Optional SMTP relay (any provider you configure yourself) — SMTP_*
  3. Console logging (always works, and the reset code is also shown in the UI)

No Resend, no SendGrid, no Brevo, no external APIs. Ever.
"""
import smtplib
import os
import logging
import email.utils
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from typing import Optional
from uuid import uuid4

logger = logging.getLogger(__name__)


def _logo_data_uri() -> str:
    """Inline logo for email HTML (no external host needed)."""
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, "logo_b64.txt")
    if os.path.exists(path):
        with open(path) as f:
            return f"data:image/png;base64,{f.read().strip()}"
    return ""


LOGO_HTML = f'<img src="{_logo_data_uri()}" alt="HRMS.Pro!" style="width:110px;height:auto;display:block;margin:0 auto 10px;" />'


def brand_header(title: str, subtitle: str = "") -> str:
    """Reusable branded email header with the HRMS.Pro! logo."""
    return f"""<div style="background:linear-gradient(135deg,#1a237e,#283593);color:#ffffff;padding:32px 40px;text-align:center;">
  {LOGO_HTML}
  <div style="font-size:24px;font-weight:700;letter-spacing:0.5px;">HRMS<span style="color:#60a5fa;">.Pro!</span></div>
  <div style="font-size:14px;opacity:0.85;margin-top:4px;">{subtitle or title}</div>
</div>"""


class EmailService:
    # Optional SMTP relay (only if you configure it yourself)
    SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
    FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@hrmspro.com")
    FROM_NAME = os.getenv("FROM_NAME", "HRMS Pro")

    @staticmethod
    def send_email(to_email: str, subject: str, html_content: str, text_content: Optional[str] = None) -> bool:
        """Send email using the best available self-hosted method."""
        return EmailService.send_email_with_attachment(
            to_email, subject, html_content, text_content=text_content,
        )

    @staticmethod
    def send_email_with_attachment(
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
        attachments: Optional[list] = None,
    ) -> bool:
        """Send an email, optionally with PDF attachments.

        `attachments` is a list of dicts: {"filename": str, "data": bytes, "mime": str}.
        """
        # Always log to console (zero setup, works immediately)
        logger.info(f"\n{'='*60}\n📧 TO: {to_email}\n📌 SUBJECT: {subject}\n{'='*60}")
        if attachments:
            for att in attachments:
                logger.info(f"   📎 ATTACHMENT: {att.get('filename')} ({len(att.get('data', b''))} bytes)")

        # Method 1: Self-hosted direct-to-MX delivery (no third party)
        try:
            if EmailService._send_via_direct_mx(to_email, subject, html_content, text_content, attachments):
                return True
        except Exception as e:
            logger.warning(f"Direct MX failed: {e}")

        # Method 2: Optional SMTP relay (only if you configured SMTP_* yourself)
        if EmailService.SMTP_USERNAME and EmailService.SMTP_PASSWORD:
            try:
                if EmailService._send_via_smtp(to_email, subject, html_content, text_content, attachments):
                    return True
            except Exception as e:
                logger.warning(f"SMTP failed: {e}")

        logger.info("Email logged to console (direct delivery unavailable; reset code is shown in the UI).")
        return False

    @staticmethod
    def _build_message(
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str],
        attachments: Optional[list] = None,
    ) -> MIMEMultipart:
        """Build a plain+HTML MIME message with optional PDF attachments."""
        msg = MIMEMultipart("alternative")
        msg["From"] = f"{EmailService.FROM_NAME} <{EmailService.FROM_EMAIL}>"
        msg["To"] = to_email
        msg["Subject"] = subject
        msg["Message-ID"] = f"<{uuid4().hex}@hrmspro>"
        msg["Date"] = email.utils.formatdate(localtime=True)
        if text_content:
            msg.attach(MIMEText(text_content, "plain"))
        msg.attach(MIMEText(html_content, "html"))
        if attachments:
            for att in attachments:
                mime_type = att.get("mime", "application/pdf")
                part = MIMEApplication(att.get("data", b""), _subtype=mime_type.split("/")[-1])
                part.add_header("Content-Disposition", "attachment", filename=att.get("filename", "document.pdf"))
                msg.attach(part)
        return msg

    @staticmethod
    def _send_via_direct_mx(
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
        attachments: Optional[list] = None,
    ) -> bool:
        """Send email DIRECTLY to the recipient's mail server (MX lookup, port 25).
        Self-hosted — no third-party provider, no account, no API key.

        Requires outbound port 25 on the server. Deliverability depends on the
        server's IP reputation and on SPF/DKIM records for the FROM domain."""
        from email.utils import parseaddr
        import dns.resolver

        _, recipient = parseaddr(to_email)
        if not recipient or "@" not in recipient:
            logger.warning(f"Direct MX: invalid recipient {to_email}")
            return False

        domain = recipient.split("@", 1)[1]
        try:
            mx_records = dns.resolver.resolve(domain, "MX", lifetime=10)
            hosts = sorted(
                (int(r.preference), str(r.exchange).rstrip("."))
                for r in mx_records
            )
        except Exception as e:
            logger.warning(f"Direct MX: no MX records for {domain}: {e}")
            return False

        if not hosts:
            logger.warning(f"Direct MX: no mail hosts for {domain}")
            return False

        msg = EmailService._build_message(to_email, subject, html_content, text_content, attachments)

        envelope_from = EmailService.FROM_EMAIL or "noreply@hrmspro.com"
        helo_domain = (EmailService.FROM_EMAIL.split("@")[-1] or "hrmspro.com")
        last_err = None
        for _pref, mx_host in hosts[:3]:  # try up to 3 MX hosts
            try:
                with smtplib.SMTP(mx_host, 25, timeout=20) as server:
                    server.ehlo(helo_domain)
                    server.sendmail(envelope_from, recipient, msg.as_string())
                logger.info(f"✅ Sent directly to {recipient} via MX {mx_host}")
                return True
            except Exception as e:
                last_err = e
                logger.warning(f"Direct MX via {mx_host} failed: {e}")

        logger.warning(f"Direct MX delivery failed for {recipient}: {last_err}")
        return False

    @staticmethod
    def _send_via_smtp(
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
        attachments: Optional[list] = None,
    ) -> bool:
        """Send via an SMTP relay (optional — only if you configure SMTP_* yourself)."""
        msg = EmailService._build_message(to_email, subject, html_content, text_content, attachments)

        with smtplib.SMTP(EmailService.SMTP_SERVER, EmailService.SMTP_PORT) as server:
            server.starttls()
            server.login(EmailService.SMTP_USERNAME, EmailService.SMTP_PASSWORD)
            server.send_message(msg)
        logger.info("✅ Sent via SMTP relay")
        return True

    @staticmethod
    def send_verification_email(to_email: str, verification_link: str) -> bool:
        """Send email verification link."""
        html_content = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 20px; }}
  .container {{ max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }}
  .body {{ padding: 32px 40px; color: #333; line-height: 1.7; }}
  .button {{ display: inline-block; padding: 14px 36px; background: #1a237e; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }}
  .footer {{ background: #f8f9fa; padding: 20px 40px; text-align: center; color: #888; font-size: 12px; }}
</style></head><body>
<div class="container">
  {brand_header("Verify Your Email")}
  <div class="body">
    <h2>Welcome to HRMS.Pro!</h2>
    <p>Please verify your email address by clicking the button below:</p>
    <div style="text-align:center;"><a href="{verification_link}" class="button">Verify Email</a></div>
    <p style="color:#666;font-size:13px;">Or copy this link: <span style="color:#1a237e;">{verification_link}</span></p>
    <p style="color:#666;font-size:13px;">This link expires in 24 hours. If you didn't create an account, ignore this email.</p>
  </div>
  <div class="footer"><p>© HRMS.Pro!. All rights reserved.</p></div>
</div></body></html>"""
        return EmailService.send_email(to_email, "Verify Your Email — HRMS.Pro!", html_content)
