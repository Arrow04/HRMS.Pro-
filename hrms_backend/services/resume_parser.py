"""Resume / CV parsing service.

Extracts structured candidate data from PDF and DOCX resumes using a
combination of rule-based extraction and (optionally) LLM enrichment when
OPENAI_API_KEY is configured. Runs fully offline otherwise.
"""
import io
import os
import re
from datetime import datetime
from typing import Dict, List, Optional

import pypdf
from docx import Document


SKILL_KEYWORDS = [
    "python", "java", "javascript", "typescript", "react", "angular", "vue",
    "node", "nodejs", "sql", "mysql", "postgresql", "mongodb", "redis",
    "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "ci/cd",
    "git", "github", "gitlab", "rest api", "graphql", "fastapi", "django",
    "flask", "spring", "spring boot", ".net", "c#", "c++", "go", "golang",
    "ruby", "php", "laravel", "html", "css", "tailwind", "bootstrap",
    "machine learning", "deep learning", "nlp", "pandas", "numpy", "tensorflow",
    "pytorch", "scikit-learn", "data analysis", "tableau", "power bi",
    "excel", "powerpoint", "word", "agile", "scrum", "jira", "project management",
    "leadership", "team management", "stakeholder management", "communication",
    "sales", "marketing", "seo", "content writing", "accounting", "finance",
    "hr", "recruitment", "customer service", "supply chain", "qa", "testing",
    "selenium", "cypress", "devops", "linux", "bash", "powershell",
    "sap", "oracle", "salesforce", "hubspot", "zendesk", "figma", "photoshop",
]

EDUCATION_DEGREES = [
    "b.tech", "b.e", "bachelor", "bsc", "b.s.c", "bca", "bba", "b.com", "b.a",
    "m.tech", "m.e", "master", "msc", "m.s.c", "mca", "mba", "m.com", "m.a",
    "phd", "doctorate", "diploma", "pgdm", "pgd", "high school", "ssc", "hsc",
    "bachelor of", "master of", "masters", "bachelore"
]


def extract_text_from_pdf(data: bytes) -> str:
    try:
        reader = pypdf.PdfReader(io.BytesIO(data))
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(pages)
    except Exception:
        return ""


def extract_text_from_docx(data: bytes) -> str:
    try:
        doc = Document(io.BytesIO(data))
        parts = [p.text for p in doc.paragraphs if p.text.strip()]
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    if cell.text.strip():
                        parts.append(cell.text)
        return "\n".join(parts)
    except Exception:
        return ""


def extract_text(filename: str, data: bytes) -> str:
    ext = filename.lower().split(".")[-1] if "." in filename else ""
    if ext == "pdf":
        return extract_text_from_pdf(data)
    if ext in ("docx", "doc"):
        return extract_text_from_docx(data)
    if ext in ("txt", "text"):
        try:
            return data.decode("utf-8", errors="replace")
        except Exception:
            return ""
    return ""


EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
PHONE_RE = re.compile(
    r"(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}"
)
LINKEDIN_RE = re.compile(r"(https?://)?(www\.)?linkedin\.com/in/[a-zA-Z0-9\-_/]+")
GITHUB_RE = re.compile(r"(https?://)?(www\.)?github\.com/[a-zA-Z0-9\-_]+")
GITHUB_RE2 = re.compile(r"github\.com/[a-zA-Z0-9\-_]+")
GPA_RE = re.compile(r"(?:gpa|cgpa)\s*[:=]?\s*(\d+(?:\.\d+)?)")

NAME_CAPITALIZED = re.compile(r"^[A-Z][a-zA-Z'\-]+(?:\s[A-Z][a-zA-Z'\-]+)+$")


def _guess_name(text: str) -> str:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    for line in lines[:6]:
        # Skip lines that look like emails/phones/urls/headers
        if len(line) > 50:
            continue
        if "@" in line or "resume" in line.lower() or "curriculum" in line.lower():
            continue
        if re.search(r"\d{3,}", line):
            continue
        if NAME_CAPITALIZED.match(line) and 2 <= len(line.split()) <= 4:
            return line
    return ""


def _extract_skills(text: str) -> List[str]:
    lowered = text.lower()
    found = set()
    for skill in SKILL_KEYWORDS:
        if re.search(rf"(?<![a-z0-9]){re.escape(skill)}(?![a-z0-9])", lowered):
            found.add(skill)
    return sorted(found)


def _extract_education(text: str) -> List[str]:
    found = []
    lowered = text.lower()
    for deg in EDUCATION_DEGREES:
        if deg in lowered:
            found.append(deg.title())
    # Dedupe: skip a degree if it's a substring/prefix of one already kept
    result = []
    for d in found:
        if any(d in kept or kept in d for kept in result):
            continue
        result.append(d)
    return result[:8]


def _extract_experience_years(text: str) -> Optional[float]:
    patterns = [
        r"(\d+(?:\.\d+)?)\+?\s*(?:years|yrs|yr)\s*(?:of)?\s*experience",
        r"experience\s*(?:of|:)?\s*(\d+(?:\.\d+)?)\+?\s*(?:years|yrs|yr)",
        r"(\d+(?:\.\d+)?)\+?\s*[+-]\s*years",
    ]
    for pat in patterns:
        m = re.search(pat, text.lower())
        if m:
            try:
                return float(m.group(1))
            except Exception:
                pass
    return None


def _extract_current_company_and_title(text: str) -> tuple:
    """Return (company, title) for the most recent role."""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    exp_index = None
    for i, line in enumerate(lines):
        lowered = line.lower()
        if re.search(r"(?i)^(experience|professional experience|work experience|employment)\s*$", lowered):
            exp_index = i
            break
        if "experience" in lowered and "summary" not in lowered:
            exp_index = i
            break

    # Search a window after the experience heading (or the whole text) for a
    # "Company — Title" style line, keeping the most recent (topmost) match.
    start = exp_index if exp_index is not None else 0
    window = lines[start: start + 25]
    for line in window:
        lowered = line.lower()
        if re.search(r"(?i)(experience|summary|education|skills|project|objective|about me)\b", lowered) and len(line) < 60:
            continue
        # Role line: "Title, Company" or "Title at Company" or "Company — Title"
        m = re.match(r"^([A-Za-z][A-Za-z .\-]{2,50}?)(?:\s*[,|\-—]\s*|\s+at\s+|\s+@\s+)([A-Z][A-Za-z0-9 .&'\-]{2,60})$", line)
        if m:
            left = m.group(1).strip()
            right = m.group(2).strip()
            left_has_role = any(w in left.lower() for w in ["engineer", "developer", "manager", "lead", "architect", "analyst", "consultant", "scientist", "designer", "specialist", "officer", "intern", "head", "director", "vp", "executive"])
            right_has_role = any(w in right.lower() for w in ["engineer", "developer", "manager", "lead", "architect", "analyst", "consultant", "scientist", "designer", "specialist", "officer", "intern", "head", "director", "vp", "executive"])
            if left_has_role and not right_has_role:
                title, company = left, right
            elif right_has_role and not left_has_role:
                company, title = left, right
            else:
                company, title = left, right
            if 2 <= len(company) <= 60 and not any(w in company.lower() for w in ["experience", "summary", "education", "skills", "project", "certification", "language"]):
                return company, title
        # Plain company line after experience heading (e.g. "Title, Company (2019 - Present)")
        if exp_index is not None and re.search(r"\((?:19|20)\d{2}", line) and len(line) < 90:
            base = re.sub(r"\s*\((?:19|20)\d{2}.*$", "", line).strip()
            if "," in base:
                parts = [p.strip() for p in re.split(r"\s*[,]\s*", base)]
                if len(parts) >= 2:
                    left, right = parts[0], " ".join(parts[1:])
                    left_has_role = any(w in left.lower() for w in ["engineer", "developer", "manager", "lead", "architect", "analyst", "consultant", "scientist", "designer", "specialist", "officer", "intern", "head", "director", "vp", "executive"])
                    right_has_role = any(w in right.lower() for w in ["engineer", "developer", "manager", "lead", "architect", "analyst", "consultant", "scientist", "designer", "specialist", "officer", "intern", "head", "director", "vp", "executive"])
                    if left_has_role and not right_has_role:
                        title, company = left, right
                    elif right_has_role and not left_has_role:
                        company, title = left, right
                    else:
                        company, title = left, right
                    if 2 <= len(company) <= 60 and not any(w in company.lower() for w in ["experience", "summary", "education", "skills", "project"]):
                        return company, title
            company = base
            if 2 <= len(company) <= 60 and not any(w in company.lower() for w in ["experience", "summary", "education", "skills", "project"]):
                return company, None
        # Plain company line after experience heading
        if exp_index is not None and re.search(r"(?:\||—|–|-)\s*[A-Z][a-z]", line) and len(line) < 80:
            company = re.split(r"\s*(?:\||—|–|-)\s*", line)[0].strip()
            company = re.sub(r"\s*\((?:19|20)\d{2}.*$", "", company).strip()
            company = re.sub(r"\s*[,].*$", "", company).strip()
            if 2 <= len(company) <= 60 and not any(w in company.lower() for w in ["experience", "summary", "education", "skills", "project"]):
                return company, None
        # "Title, Company (years)" — dates in parentheses on the line
        if re.search(r"\((19|20)\d{2}", line):
            base = re.sub(r"\s*\((?:19|20)\d{2}.*$", "", line).strip()
            if base:
                parts = re.split(r"\s*[—–|,:]\s*", base)
                if len(parts) >= 2:
                    left, right = parts[0].strip(), parts[1].strip()
                    if any(w in right.lower() for w in ["engineer", "developer", "manager", "lead", "architect", "analyst", "consultant", "scientist", "designer", "specialist", "officer", "intern", "head", "director", "vp"]):
                        title, company = left, right
                    else:
                        company, title = left, right
                    if 2 <= len(company) <= 60 and not any(w in company.lower() for w in ["experience", "education", "skills", "summary"]):
                        return company, title
    return None, None


def _extract_current_company(text: str) -> Optional[str]:
    company, _ = _extract_current_company_and_title(text)
    return company


def _extract_highlights(text: str) -> List[str]:
    bullets = []
    for line in text.splitlines():
        s = line.strip().lstrip("•-*").strip()
        if len(s) > 30 and not s.startswith(("http", "www", "@")):
            bullets.append(s[:200])
    return bullets[:12]


ADDRESS_PATTERNS = [
    r"(?i)\b\d{1,6}[a-z]?\s+[a-z0-9 ,\.]+(?:street|st\.|avenue|ave\.|road|rd\.|lane|ln\.|block|colony|nagar|extn|layout|sector|phase|township)[a-z0-9 ,\.]*(?:,\s*[a-z ]+){0,3}",
    r"(?i)\b(?:address|current address|permanent address|residence)\s*[:,-]\s*([^\n]{5,120})",
]

def _extract_address(text: str) -> str:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    for i, line in enumerate(lines):
        if re.search(r"(?i)^(address|current address|permanent address|residential address)\s*[:,\-]?\s*$", line):
            if i + 1 < len(lines) and 5 <= len(lines[i + 1]) <= 120:
                return lines[i + 1]
            continue
        lowered = line.lower()
        if any(k in lowered for k in ["address :", "address:", "address -", "address,"]):
            val = re.split(r"address\s*[:,\-]", line, flags=re.I)[-1].strip()
            if 5 <= len(val) <= 120:
                return val
    # Fallback: scan for a line that looks like a postal address
    for line in lines:
        if len(line) > 8 and len(line) <= 120 and re.search(r"\d{3,6}", line) and re.search(
            r"(?i)(street|road|rd|avenue|ave|lane|block|colony|nagar|sector|layout|city|town|village|p\.?o\.?|district|pin)",
            line,
        ):
            return line
    return ""


def parse_resume(filename: str, data: bytes, text: Optional[str] = None) -> Dict:
    """Parse a resume file into structured candidate data."""
    if text is None:
        text = extract_text(filename, data)
    if not text or not text.strip():
        return {"error": "Could not extract text from the file. Please upload a PDF, DOCX or TXT file."}

    email_match = EMAIL_RE.search(text)
    phone_match = PHONE_RE.search(text)
    linkedin_match = LINKEDIN_RE.search(text)
    github_match = GITHUB_RE.search(text) or GITHUB_RE2.search(text)

    email = email_match.group(0) if email_match else ""
    phone = phone_match.group(0).strip() if phone_match else ""

    name = _guess_name(text)

    # Split name into first/last (last token = last name)
    first_name, last_name = name, ""
    if name:
        parts = name.split()
        if len(parts) >= 2:
            first_name = " ".join(parts[:-1])
            last_name = parts[-1]

    skills = _extract_skills(text)
    education = _extract_education(text)
    experience_years = _extract_experience_years(text)
    current_company, current_title = _extract_current_company_and_title(text)
    highlights = _extract_highlights(text)
    address = _extract_address(text)

    return {
        "filename": filename,
        "name": name,
        "firstName": first_name,
        "lastName": last_name,
        "email": email,
        "phone": phone,
        "address": address,
        "currentAddress": address,
        "permanentAddress": address,
        "linkedinUrl": linkedin_match.group(0) if linkedin_match else "",
        "githubUrl": github_match.group(0) if github_match else "",
        "skills": skills,
        "skillsText": ", ".join(skills),
        "education": education,
        "educationText": ", ".join(education),
        "experienceYears": experience_years,
        "currentCompany": current_company,
        "currentTitle": current_title,
        "summary": highlights[0] if highlights else "",
        "highlights": highlights,
        "textLength": len(text),
    }


def enrich_with_llm(parsed: Dict, text: str) -> Dict:
    """Optionally enrich parsed data using an LLM when OPENAI_API_KEY is set."""
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        return parsed
    try:
        import json as _json
        from openai import OpenAI
    except Exception:
        return parsed

    try:
        client = OpenAI(api_key=api_key)
        prompt = (
            "Extract structured candidate data from this resume. "
            "Return ONLY valid JSON with keys: full_name, email, phone, address, skills (array), "
            "education (array), years_of_experience (number or null), current_company, "
            "current_title, summary. Resume text:\n\n" + text[:8000]
        )
        resp = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=1000,
        )
        content = resp.choices[0].message.content.strip()
        content = re.sub(r"^```(?:json)?|```$", "", content).strip()
        data = _json.loads(content)
        merged = dict(parsed)
        if data.get("full_name"):
            parts = data["full_name"].split()
            merged["name"] = data["full_name"]
            merged["firstName"] = " ".join(parts[:-1]) if len(parts) > 1 else data["full_name"]
            merged["lastName"] = parts[-1] if parts else ""
        if data.get("email"):
            merged["email"] = data["email"]
        if data.get("phone"):
            merged["phone"] = data["phone"]
        if data.get("address"):
            merged["address"] = data["address"]
            merged["currentAddress"] = data["address"]
            merged["permanentAddress"] = data["address"]
        if data.get("skills"):
            merged["skills"] = data["skills"]
            merged["skillsText"] = ", ".join(data["skills"])
        if data.get("education"):
            merged["education"] = data["education"]
            merged["educationText"] = ", ".join(data["education"])
        if data.get("years_of_experience") is not None:
            merged["experienceYears"] = data["years_of_experience"]
        if data.get("current_company"):
            merged["currentCompany"] = data["current_company"]
        if data.get("current_title"):
            merged["currentTitle"] = data["current_title"]
        if data.get("summary"):
            merged["summary"] = data["summary"]
        merged["llmEnriched"] = True
        return merged
    except Exception:
        return parsed
