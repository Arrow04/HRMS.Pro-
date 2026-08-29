"""
SMS & WhatsApp Notification Service
Supports (in priority order — all free/open-source except Twilio):
  1. Twilio SMS API            (paid, optional)
  2. Twilio WhatsApp API       (paid, optional)
  3. Gammu SMSD gateway        (FREE, open-source — GSM modem + SIM)
  4. Email-to-SMS carrier gateways (FREE — e.g. @vtext.com, @tmomail.net)
  5. Console logging           (zero setup, always works)
"""
import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class NotificationService:
    TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "")
    TWILIO_WHATSAPP_NUMBER = os.getenv("TWILIO_WHATSAPP_NUMBER", "whatsapp:+14155238886")

    # Free open-source SMS via Gammu SMSD (GSM modem): https://wammu.eu/smsd/
    # Runs its own HTTP API e.g. https://gammu.foo/api/send?number=..&text=..
    GAMMU_URL = os.getenv("GAMMU_URL", "")
    GAMMU_TOKEN = os.getenv("GAMMU_TOKEN", "")

    # Free email-to-SMS carrier gateway (works without a modem, carrier-dependent)
    SMS_EMAIL_GATEWAY = os.getenv("SMS_EMAIL_GATEWAY", "")  # e.g. %s@vtext.com

    @staticmethod
    def _send_via_gammu(phone: str, message: str) -> bool:
        """Send SMS through a Gammu SMSD gateway (free, open-source, GSM modem)."""
        import requests
        try:
            params = {"number": phone, "text": message}
            headers = {}
            if NotificationService.GAMMU_TOKEN:
                headers["Authorization"] = f"Bearer {NotificationService.GAMMU_TOKEN}"
            resp = requests.post(NotificationService.GAMMU_URL, params=params, headers=headers, timeout=15)
            if resp.ok:
                logger.info("✅ SMS sent via Gammu gateway")
                return True
            logger.warning(f"Gammu gateway error {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            logger.warning(f"Gammu gateway failed: {e}")
        return False

    @staticmethod
    def _send_via_email_gateway(phone: str, message: str) -> bool:
        """Send SMS via a free carrier email-to-SMS gateway (e.g. @vtext.com)."""
        if not NotificationService.SMS_EMAIL_GATEWAY:
            return False
        try:
            from services.email_service import EmailService
            # phone like +919876543210 -> 919876543210
            digits = "".join(ch for ch in phone if ch.isdigit())
            EmailService.send_email(
                to_email=NotificationService.SMS_EMAIL_GATEWAY % digits,
                subject="",
                html_content=f"<p>{message}</p>",
                text_content=message,
            )
            logger.info("✅ SMS sent via email gateway")
            return True
        except Exception as e:
            logger.warning(f"Email-to-SMS gateway failed: {e}")
        return False

    @staticmethod
    def send_sms(phone: str, message: str) -> bool:
        """Send SMS — try Twilio, then Gammu, then email gateway, then console."""
        logger.info(f"\n{'='*60}\n📱 SMS TO: {phone}\n📩 MESSAGE: {message[:100]}...\n{'='*60}")

        # Twilio SMS (paid, optional)
        if NotificationService.TWILIO_ACCOUNT_SID and NotificationService.TWILIO_AUTH_TOKEN:
            try:
                from twilio.rest import Client
                client = Client(NotificationService.TWILIO_ACCOUNT_SID, NotificationService.TWILIO_AUTH_TOKEN)
                client.messages.create(
                    body=message,
                    from_=NotificationService.TWILIO_PHONE_NUMBER,
                    to=phone,
                )
                logger.info("✅ SMS sent via Twilio")
                return True
            except Exception as e:
                logger.warning(f"Twilio SMS failed: {e}")

        # Free open-source: Gammu SMSD gateway (GSM modem)
        if NotificationService.GAMMU_URL and NotificationService._send_via_gammu(phone, message):
            return True

        # Free: email-to-SMS carrier gateway
        if NotificationService._send_via_email_gateway(phone, message):
            return True

        logger.info("SMS logged to console (no SMS provider configured)")
        return True

    @staticmethod
    def send_whatsapp(phone: str, message: str) -> bool:
        """Send WhatsApp message via Twilio API (paid, optional)."""
        logger.info(f"\n{'='*60}\n💬 WHATSAPP TO: {phone}\n📩 MESSAGE: {message[:100]}...\n{'='*60}")

        if NotificationService.TWILIO_ACCOUNT_SID and NotificationService.TWILIO_AUTH_TOKEN:
            try:
                from twilio.rest import Client
                client = Client(NotificationService.TWILIO_ACCOUNT_SID, NotificationService.TWILIO_AUTH_TOKEN)
                client.messages.create(
                    body=message,
                    from_=NotificationService.TWILIO_WHATSAPP_NUMBER,
                    to=f"whatsapp:{phone}",
                )
                logger.info("✅ WhatsApp sent via Twilio")
                return True
            except Exception as e:
                logger.warning(f"Twilio WhatsApp failed: {e}")

        # Free fallback: send as regular SMS instead
        return NotificationService.send_sms(phone, message)

    @staticmethod
    def send_otp(phone: str, otp: str) -> bool:
        """Send OTP via SMS."""
        return NotificationService.send_sms(phone, f"Your HRMS Pro verification code is: {otp}. Valid for 5 minutes.")

    @staticmethod
    def send_attendance_reminder(phone: str, employee_name: str, date: str) -> bool:
        msg = f"Hi {employee_name}, your attendance for {date} is pending. Please check in on HRMS Pro."
        return NotificationService.send_whatsapp(phone, msg)

    @staticmethod
    def send_payslip_notification(phone: str, employee_name: str, month: int, year: int, amount: float) -> bool:
        msg = f"Hi {employee_name}, your payslip for {month}/{year} is ready. Net salary: ₹{amount:,.2f}. View on HRMS Pro."
        return NotificationService.send_whatsapp(phone, msg)
