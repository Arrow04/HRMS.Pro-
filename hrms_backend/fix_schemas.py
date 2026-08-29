"""Fix core/schemas.py: include all schema classes (BaseModel-direct AND subclasses)."""
import ast
import os

BASE = os.path.dirname(os.path.abspath(__file__))
BACKUP = os.path.join(BASE, "main.py.bak_split")
OUT = os.path.join(BASE, "core", "schemas.py")

with open(BACKUP, encoding="utf-8") as f:
    src = f.read()
lines = src.splitlines(keepends=True)
tree = ast.parse(src)

# Build set of all schema classes via transitive closure:
# base = BaseModel, then any class subclassing an already-included schema.
schema_names = set()
classes = {n.name: n for n in ast.walk(tree) if isinstance(n, ast.ClassDef)}

def includes_schema(n):
    for b in n.bases:
        if isinstance(b, ast.Name):
            if b.id == "BaseModel" or b.id in schema_names:
                return True
    return False

changed = True
while changed:
    changed = False
    for n in classes.values():
        if n.name not in schema_names and includes_schema(n):
            schema_names.add(n.name)
            changed = True

ordered = [classes[n] for n in schema_names]
ordered.sort(key=lambda n: n.lineno)

def get_source(n):
    return "".join(lines[n.lineno - 1:n.end_lineno])

HEADER = '''"""Pydantic request/response models for the HRMS API."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, ConfigDict


'''
body = "\n\n".join(get_source(n) for n in ordered) + "\n"

with open(OUT, "w", encoding="utf-8") as f:
    f.write(HEADER + body)

print(f"Regenerated core/schemas.py with {len(ordered)} classes (was 57)")
