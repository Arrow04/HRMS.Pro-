"""Identity document parsing — auto-extracts the number from uploaded
Aadhar / PAN / Voter / Driving License / Passport documents.

Approach:
  * Images (jpg/png/webp) → OCR via easyocr (bundled models, no system binary).
  * PDFs → try embedded text first via pypdf; if no text (scanned), render each
    page to an image and OCR it. Rendering needs PyMuPDF (fitz); if unavailable,
    fall back to the embedded text only.
"""
import io
import os
import re
from typing import Optional

# ── Number extraction patterns per document type ──
AADHAR_RE = re.compile(r"(?<!\d)(\d{4}[\s-]?\d{4}[\s-]?\d{4})(?!\d)")
PAN_RE = re.compile(r"(?<![A-Z0-9])([A-Z]{5}[0-9]{4}[A-Z])(?![A-Z0-9])")
VOTER_RE = re.compile(r"(?<!\w)([A-Z]{3}\d{7})(?!\w)")
DL_RE = re.compile(r"(?<!\w)([A-Z]{2}[-/ ]?\d{2}[-/ ]?\d{4}[-/ ]?\d{7})(?!\w)")
PASSPORT_RE = re.compile(r"(?<![A-Z0-9])([A-Z][0-9]{7})(?![A-Z0-9])")

_PATTERNS = {
    "aadhar": AADHAR_RE,
    "pan": PAN_RE,
    "voter": VOTER_RE,
    "drivingLicense": DL_RE,
    "passport": PASSPORT_RE,
}


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text or "")


def _extract_aadhar(text: str) -> Optional[str]:
    """Extract 12-digit Aadhaar from OCR text (handles spacing/noise)."""
    normalized = _normalize(text)
    match = AADHAR_RE.search(normalized)
    if match:
        return re.sub(r"\s|-", "", match.group(1))
    # OCR fallback: grouped digits with variable spacing
    loose = re.compile(r"(?<!\d)(\d[\d\s-]{10,18}\d)(?!\d)")
    for candidate in loose.findall(normalized):
        digits = re.sub(r"\D", "", candidate)
        if len(digits) == 12:
            return digits
    # Last resort: any 12-digit run in the digit stream
    compact = re.sub(r"\D", " ", normalized)
    for chunk in compact.split():
        if len(chunk) == 12 and chunk.isdigit():
            return chunk
    return None


def _best_match(text: str, doc_type: str) -> Optional[str]:
    """Return the most confident-looking number for the doc type."""
    if doc_type == "aadhar":
        return _extract_aadhar(text)
    pattern = _PATTERNS.get(doc_type)
    if not pattern:
        return None
    matches = pattern.findall(_normalize(text))
    if not matches:
        return None
    raw = matches[0]
    if doc_type in ("drivingLicense",):
        return re.sub(r"\s|/", " ", raw).replace(" ", "-").upper()
    return raw.upper()


# Lazy, process-wide OCR reader (loaded once)
_reader = None


def _get_reader():
    global _reader
    if _reader is None:
        try:
            import easyocr
            _reader = easyocr.Reader(["en"], gpu=False, verbose=False)
        except Exception:
            _reader = False
    return _reader or None


def extract_text_from_image(data: bytes) -> str:
    """OCR an image (jpg/png/webp) into raw text."""
    reader = _get_reader()
    if not reader:
        return ""
    try:
        import numpy as np
        from PIL import Image
        img = Image.open(io.BytesIO(data)).convert("RGB")
        arr = np.array(img)
        results = reader.readtext(arr, detail=0, paragraph=False)
        return " ".join(results)
    except Exception:
        return ""


def extract_text_from_pdf(data: bytes) -> str:
    """Extract embedded text from a PDF; if empty, try OCR of rendered pages."""
    text = ""
    try:
        import pypdf
        reader_pdf = pypdf.PdfReader(io.BytesIO(data))
        text = " ".join(page.extract_text() or "" for page in reader_pdf.pages)
    except Exception:
        pass
    text = text.strip()
    if text:
        return text
    # Scanned PDF — render pages and OCR
    try:
        import fitz  # PyMuPDF
    except Exception:
        return ""
    try:
        doc = fitz.open(stream=data, filetype="pdf")
        parts = []
        for page in doc:
            pix = page.get_pixmap(dpi=200)
            img_bytes = pix.tobytes("png")
            parts.append(extract_text_from_image(img_bytes))
        return " ".join(p for p in parts if p)
    except Exception:
        return ""


def extract_text(filename: str, data: bytes) -> str:
    ext = (filename or "").lower().split(".")[-1] if "." in (filename or "") else ""
    if ext in ("jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff"):
        return extract_text_from_image(data)
    if ext == "pdf":
        return extract_text_from_pdf(data)
    if ext in ("txt", "text"):
        try:
            return data.decode("utf-8", errors="replace")
        except Exception:
            return ""
    return ""


def parse_document_number(filename: str, data: bytes, doc_type: str) -> dict:
    """Parse an uploaded identity document and return its number (if found)."""
    text = extract_text(filename, data)
    number = _best_match(text, doc_type)
    return {
        "docType": doc_type,
        "parsedNumber": number or "",
        "matched": bool(number),
        "textLength": len(text),
    }
