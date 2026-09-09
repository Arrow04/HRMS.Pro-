#!/usr/bin/env python3
"""One-time script to populate ALL master data from DEFAULT_MASTER_DATA."""

import os
import sys

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

from models import LookupCategory, LookupValue
from routers.master_data import DEFAULT_MASTER_DATA, CATEGORY_GROUP_OVERRIDES


def seed():
    session = Session(bind=engine)
    try:
        created_categories = 0
        created_values = 0

        for page_group, categories in DEFAULT_MASTER_DATA.items():
            for cat_data in categories:
                effective_group = CATEGORY_GROUP_OVERRIDES.get(cat_data["code"], page_group)
                existing_cat = session.query(LookupCategory).filter(LookupCategory.code == cat_data["code"]).first()

                if not existing_cat:
                    category = LookupCategory(
                        code=cat_data["code"],
                        name=cat_data["name"],
                        description=cat_data.get("description"),
                        page_group=effective_group,
                        icon=cat_data.get("icon"),
                        is_active=True,
                        is_system=True,
                    )
                    session.add(category)
                    session.flush()
                    created_categories += 1
                    for val_data in cat_data.get("values", []):
                        session.add(
                            LookupValue(
                                category_id=category.id,
                                code=val_data["code"],
                                name=val_data["name"],
                                description=val_data.get("description"),
                                is_active=True,
                                sort_order=0,
                            )
                        )
                        created_values += 1
                else:
                    for val_data in cat_data.get("values", []):
                        exists = session.query(LookupValue).filter(
                            LookupValue.category_id == existing_cat.id,
                            LookupValue.code == val_data["code"],
                        ).first()
                        if not exists:
                            session.add(
                                LookupValue(
                                    category_id=existing_cat.id,
                                    code=val_data["code"],
                                    name=val_data["name"],
                                    description=val_data.get("description"),
                                    is_active=True,
                                    sort_order=0,
                                )
                            )
                            created_values += 1

        session.commit()
        total_cats = session.query(LookupCategory).count()
        total_vals = session.query(LookupValue).count()
        print(f"Master data seeded: {created_categories} new categories, {created_values} new values")
        print(f"Total in DB: {total_cats} categories, {total_vals} values")
    except Exception as e:
        session.rollback()
        print(f"Master data seed failed: {e}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    seed()
