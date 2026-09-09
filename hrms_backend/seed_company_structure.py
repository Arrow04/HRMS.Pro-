#!/usr/bin/env python3
"""One-time script to populate company structure: companies, branches, departments, designations."""

import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://hrms_user:hrms_password@localhost:5433/hrms_db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)
if DATABASE_URL.startswith("sqlite:///"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL)

from models import Organization, Company, Branch, Department, Designation, Employee

DEFAULT_COMPANIES = [
    {"name": "Primary Unit", "code": "PRIMARY", "industry": "Technology", "company_size": "100-500"},
    {"name": "Subsidiary", "code": "SUB", "industry": "Technology", "company_size": "50-200"},
]

DEFAULT_BRANCHES = [
    {"name": "Head Office", "code": "HO", "location": "Mumbai, India"},
    {"name": "Regional Office", "code": "RO", "location": "Bangalore, India"},
]

DEFAULT_DEPARTMENTS = [
    {"name": "Engineering", "code": "ENG"},
    {"name": "Human Resources", "code": "HR"},
    {"name": "Finance", "code": "FIN"},
    {"name": "Sales", "code": "SAL"},
    {"name": "Marketing", "code": "MKT"},
]

DEFAULT_DESIGNATIONS = [
    {"title": "Software Engineer", "grade": "Junior", "min_salary": 600000, "max_salary": 1200000},
    {"title": "Senior Software Engineer", "grade": "Senior", "min_salary": 1200000, "max_salary": 2000000},
    {"title": "Tech Lead", "grade": "Lead", "min_salary": 2000000, "max_salary": 3500000},
    {"title": "HR Manager", "grade": "Manager", "min_salary": 700000, "max_salary": 1400000},
    {"title": "Finance Manager", "grade": "Manager", "min_salary": 900000, "max_salary": 1800000},
    {"title": "Sales Manager", "grade": "Manager", "min_salary": 800000, "max_salary": 1500000},
    {"title": "Marketing Manager", "grade": "Manager", "min_salary": 800000, "max_salary": 1500000},
]


def seed():
    session = Session(bind=engine)
    try:
        orgs = session.query(Organization).all()
        if not orgs:
            print("No organizations found. Create a tenant first.")
            return

        total_companies = 0
        total_branches = 0
        total_departments = 0
        total_designations = 0

        for org in orgs:
            # Skip if org already has companies
            existing_company = session.query(Company).filter(Company.organization_id == org.id).first()
            if existing_company:
                continue

            companies = []
            for cdata in DEFAULT_COMPANIES:
                comp = Company(
                    name=cdata["name"],
                    code=cdata["code"],
                    organization_id=org.id,
                    industry=cdata["industry"],
                    company_size=cdata["company_size"],
                    status="active",
                    address="",
                    email=f"info@{org.code or org.id}.com",
                    phone="",
                )
                session.add(comp)
                session.flush()
                companies.append(comp)
                total_companies += 1

            for comp in companies:
                for bdata in DEFAULT_BRANCHES:
                    branch = Branch(
                        name=bdata["name"],
                        code=bdata["code"],
                        company_id=comp.id,
                        organization_id=org.id,
                        location=bdata["location"],
                        status="active",
                    )
                    session.add(branch)
                    session.flush()
                    total_branches += 1

                for ddata in DEFAULT_DEPARTMENTS:
                    dept = Department(
                        name=ddata["name"],
                        code=ddata["code"],
                        organization_id=org.id,
                        company_id=comp.id,
                        status="active",
                    )
                    session.add(dept)
                    session.flush()
                    total_departments += 1

                for ddata in DEFAULT_DESIGNATIONS:
                    desig = Designation(
                        title=ddata["title"],
                        grade=ddata["grade"],
                        organization_id=org.id,
                        company_id=comp.id,
                        status="active",
                        min_salary=ddata["min_salary"],
                        max_salary=ddata["max_salary"],
                    )
                    session.add(desig)
                    session.flush()
                    total_designations += 1

        session.commit()
        print(f"Company structure seeded: {total_companies} companies, {total_branches} branches, {total_departments} departments, {total_designations} designations")
    except Exception as e:
        session.rollback()
        print(f"Company seed failed: {e}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    seed()
