"""Print the AST of Python source read from stdin as JSON (used by Piyoyo's complexity estimate)."""
import ast
import json
import math
import sys

SKIPPED_FIELDS = {"ctx", "type_comment", "type_ignores", "kind"}
POSITION_FIELDS = ("lineno", "col_offset", "end_lineno", "end_col_offset")
MAX_STRING_LENGTH = 100
MAX_SAFE_INTEGER = 2 ** 53


def convert(value):
    if isinstance(value, ast.AST):
        node = {"_type": type(value).__name__}
        for name in POSITION_FIELDS:
            position = getattr(value, name, None)
            if position is not None:
                node[name] = position
        for name, child in ast.iter_fields(value):
            if name not in SKIPPED_FIELDS:
                node[name] = convert(child)
        return node
    if isinstance(value, list):
        return [convert(item) for item in value]
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, int):
        # JSON numbers lose precision beyond 2^53, so huge literals travel as strings.
        return value if abs(value) <= MAX_SAFE_INTEGER else str(value)
    if isinstance(value, float):
        return value if math.isfinite(value) else str(value)
    if isinstance(value, str):
        return value[:MAX_STRING_LENGTH]
    return repr(value)[:MAX_STRING_LENGTH]


def main():
    sys.setrecursionlimit(10000)
    source = sys.stdin.read()
    if source.startswith("﻿"):
        source = source[1:]
    try:
        tree = ast.parse(source)
    except SyntaxError as error:
        result = {"ok": False, "line": error.lineno, "col": error.offset, "message": error.msg}
    except (ValueError, RecursionError) as error:
        result = {"ok": False, "line": None, "col": None, "message": str(error)}
    else:
        result = {"ok": True, "tree": convert(tree)}
    sys.stdout.write(json.dumps(result, ensure_ascii=False))


main()
