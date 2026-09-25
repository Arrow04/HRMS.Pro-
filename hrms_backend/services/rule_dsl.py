"""Safe rule-expression DSL for payroll configuration.

The mandate is absolute: statutory formulas live in configuration and must be
evaluated WITHOUT executing arbitrary code. This module parses expressions
with Python's syntax but evaluates them through a strict whitelist AST walker —
no eval/exec, no attribute access, no imports, no calls beyond an arithmetic
stdlib (MIN/MAX/ROUND/IF/ABS/FLOOR/CEIL).

Grammar (what rule authors may write):

    expression := term (('+'|'-'|'*'|'/'|'//'|'%') term)*
    term       := NUMBER | NAME | call | '(' expression ')'
                | expression 'if' cond 'else' expression
    call       := MIN(a, b) | MAX(a, b) | ROUND(x[, n]) | ABS(x)
                | FLOOR(x) | CEIL(x) | IF(cond, then, else)
    cond       := expr ('='|'=='|'!='|'<'|'<='|'>'|'>=') expr
                | cond ('and'|'or') cond | 'not' cond

Names resolve against the evaluation context (wage bases, parameters,
employment facts). A missing name raises MissingInputError — the mandated
"identify the missing capability instead of silently producing an incorrect
payroll" behaviour.

Examples:
    MIN(PF_WAGES * RATE / 100, MAX_MONTHLY)
    BASIC + DA
    IF(GROSS_WAGES <= CEILING, GROSS_WAGES * 0.8, 0)
    ROUND(BASIC / 30 * PAID_DAYS, 2)
"""
from __future__ import annotations

import ast
import re
from typing import Any, Dict, Mapping, Union

__all__ = [
    "RuleExpressionError",
    "MissingInputError",
    "evaluate_expression",
    "validate_expression",
]


class RuleExpressionError(ValueError):
    """The expression is syntactically invalid or uses a forbidden construct."""


class MissingInputError(RuleExpressionError):
    """A referenced identifier is not bound in the evaluation context.

    This is the "missing capability" signal: callers must surface it instead of
    silently substituting a default.
    """

    def __init__(self, name: str):
        self.name = name
        super().__init__(f"Missing input '{name}' — no rule or wage definition provides it")


_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_EQ_RE = re.compile(r"(?<![<>=!])=(?!=)")


def _normalize(expr: str) -> str:
    """Rule authors write SQL-style equality ('STATE = 'KA''); accept it."""
    return _EQ_RE.sub("==", expr)

_ALLOWED_FUNCS = {"MIN", "MAX", "ROUND", "ABS", "IF", "FLOOR", "CEIL"}

_BIN_OPS = {
    ast.Add: lambda a, b: a + b,
    ast.Sub: lambda a, b: a - b,
    ast.Mult: lambda a, b: a * b,
    ast.Div: lambda a, b: a / b,
    ast.FloorDiv: lambda a, b: a // b,
    ast.Mod: lambda a, b: a % b,
}

_CMP_OPS = {
    ast.Eq: lambda a, b: a == b,
    ast.NotEq: lambda a, b: a != b,
    ast.Lt: lambda a, b: a < b,
    ast.LtE: lambda a, b: a <= b,
    ast.Gt: lambda a, b: a > b,
    ast.GtE: lambda a, b: a >= b,
}


def _check_name(name: str) -> str:
    if not _NAME_RE.match(name) or name.startswith("__"):
        raise RuleExpressionError(f"Invalid identifier: {name!r}")
    return name


def _walk(node: ast.AST, ctx: Mapping[str, Any]) -> Union[bool, int, float, str]:
    if isinstance(node, ast.Expression):
        return _walk(node.body, ctx)

    if isinstance(node, ast.Constant):
        if isinstance(node.value, (bool, int, float, str)):
            return node.value
        raise RuleExpressionError(f"Disallowed constant: {node.value!r}")

    if isinstance(node, ast.Name):
        name = _check_name(node.id)
        if name not in ctx:
            raise MissingInputError(name)
        return ctx[name]

    if isinstance(node, ast.BinOp):
        op = _BIN_OPS.get(type(node.op))
        if op is None:
            raise RuleExpressionError(f"Disallowed operator: {type(node.op).__name__}")
        left = _walk(node.left, ctx)
        right = _walk(node.right, ctx)
        if isinstance(left, str) or isinstance(right, str):
            raise RuleExpressionError("Arithmetic on text values is not allowed")
        try:
            return op(left, right)
        except ZeroDivisionError as exc:
            raise RuleExpressionError("Division by zero") from exc

    if isinstance(node, ast.UnaryOp):
        if isinstance(node.op, ast.USub):
            return -_walk(node.operand, ctx)
        if isinstance(node.op, ast.UAdd):
            return +_walk(node.operand, ctx)
        if isinstance(node.op, ast.Not):
            return not _walk(node.operand, ctx)
        raise RuleExpressionError(f"Disallowed unary operator: {type(node.op).__name__}")

    if isinstance(node, ast.Compare):
        left = _walk(node.left, ctx)
        result = True
        for op_node, comparator in zip(node.ops, node.comparators):
            op = _CMP_OPS.get(type(op_node))
            if op is None:
                raise RuleExpressionError(f"Disallowed comparison: {type(op_node).__name__}")
            right = _walk(comparator, ctx)
            result = result and op(left, right)
            left = right
        return result

    if isinstance(node, ast.BoolOp):
        if isinstance(node.op, ast.And):
            out = True
            for v in node.values:
                out = out and bool(_walk(v, ctx))
            return out
        if isinstance(node.op, ast.Or):
            out = False
            for v in node.values:
                out = out or bool(_walk(v, ctx))
            return out
        raise RuleExpressionError("Disallowed boolean operator")

    if isinstance(node, ast.IfExp):
        return _walk(node.body, ctx) if _walk(node.test, ctx) else _walk(node.orelse, ctx)

    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise RuleExpressionError("Only direct function calls are allowed")
        fname = node.func.id.upper()
        if fname not in _ALLOWED_FUNCS:
            raise RuleExpressionError(f"Function not allowed: {node.func.id}")
        if node.keywords:
            raise RuleExpressionError("Keyword arguments are not allowed")
        args = [_walk(a, ctx) for a in node.args]
        return _apply_func(fname, args)

    raise RuleExpressionError(f"Disallowed expression construct: {type(node).__name__}")


def _apply_func(fname: str, args: list):
    def _num(x, fn):
        if isinstance(x, bool) or not isinstance(x, (int, float)):
            raise RuleExpressionError(f"{fname} expects numeric arguments")
        return x

    if fname == "MIN":
        if len(args) != 2:
            raise RuleExpressionError("MIN takes exactly 2 arguments")
        return min(_num(args[0], fname), _num(args[1], fname))
    if fname == "MAX":
        if len(args) != 2:
            raise RuleExpressionError("MAX takes exactly 2 arguments")
        return max(_num(args[0], fname), _num(args[1], fname))
    if fname == "ROUND":
        if len(args) not in (1, 2):
            raise RuleExpressionError("ROUND takes 1 or 2 arguments")
        nd = int(_num(args[1], fname)) if len(args) == 2 else 0
        return round(_num(args[0], fname), nd)
    if fname == "ABS":
        if len(args) != 1:
            raise RuleExpressionError("ABS takes 1 argument")
        return abs(_num(args[0], fname))
    if fname == "FLOOR":
        import math
        if len(args) != 1:
            raise RuleExpressionError("FLOOR takes 1 argument")
        return math.floor(_num(args[0], fname))
    if fname == "CEIL":
        import math
        if len(args) != 1:
            raise RuleExpressionError("CEIL takes 1 argument")
        return math.ceil(_num(args[0], fname))
    if fname == "IF":
        if len(args) != 3:
            raise RuleExpressionError("IF takes exactly 3 arguments: IF(condition, then, else)")
        return args[1] if args[0] else args[2]
    raise RuleExpressionError(f"Function not allowed: {fname}")


def evaluate_expression(expr: str, context: Mapping[str, Any]) -> Union[bool, int, float, str]:
    """Evaluate a rule expression against a bound context. Pure function."""
    if not isinstance(expr, str) or not expr.strip():
        raise RuleExpressionError("Expression must be a non-empty string")
    if len(expr) > 2000:
        raise RuleExpressionError("Expression too long")
    try:
        tree = ast.parse(_normalize(expr), mode="eval")
    except SyntaxError as exc:
        raise RuleExpressionError(f"Invalid expression: {exc.msg}") from exc
    return _walk(tree, context)


def validate_expression(expr: str) -> None:
    """Parse-check an expression without a context (for rule publish validation)."""
    if not isinstance(expr, str) or not expr.strip():
        raise RuleExpressionError("Expression must be a non-empty string")

    # Walk with a permissive context that binds every referenced name, so
    # missing-input errors don't hide syntax/construct problems.
    seen: Dict[str, bool] = {}

    class _Collector(ast.NodeVisitor):
        def visit_Name(self, node):  # noqa: N802
            seen[_check_name(node.id)] = True

    try:
        tree = ast.parse(_normalize(expr), mode="eval")
    except SyntaxError as exc:
        raise RuleExpressionError(f"Invalid expression: {exc.msg}") from exc
    _Collector().visit(tree)
    _walk(tree, {name: 1.0 for name in seen})
