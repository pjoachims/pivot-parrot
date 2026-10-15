"""
Gate for SQL that arrives from the browser.

The frontend sends complete SQL over the component channel, and anyone who can
talk to that channel can send anything. Only a single SELECT over ``pivot_data``
gets through.

With the ``duckdb`` dialect (and the ``duckdb`` package installed) the SQL is
parsed by DuckDB itself: exactly one SELECT statement, no CTEs, no table
functions (``read_csv``, ``query``, ...), no SHOW/DESCRIBE/SUMMARIZE, no
session lookups (``getvariable``, ``current_setting``) and no table other than
``pivot_data``.

Every other dialect gets a textual check only: one statement that starts with
SELECT. It cannot see which tables or functions a SELECT reads, so for those
engines the connection's own permissions are the real boundary: connect as a
principal that can read the pivot source and nothing else. The textual check
reads string literals the way the declared dialect does, so the dialect must
be the engine's.
"""

import json
import re

SOURCE_TABLE = 'pivot_data'
SESSION_FUNCTIONS = {'getvariable', 'current_setting', 'getenv'}

# How the textual check reads string literals: the quotes in which a backslash
# escapes, and whether r'...' is a raw literal (no escapes), which is refused.
SPARK_READING = ("'\"", True)
STANDARD_READINGS = (("'", False), ('', False))
LITERAL_READINGS = {'databricks': (SPARK_READING,), 'spark': (SPARK_READING,)}


class UnsafeQueryError(ValueError):
    """The SQL is not a single SELECT over pivot_data."""


def ensure_safe_query(sql, dialect='duckdb'):
    if not isinstance(sql, str) or not sql.strip():
        raise UnsafeQueryError('Empty query')
    if dialect == 'duckdb':
        try:
            import duckdb
        except ImportError:
            duckdb = None
        if duckdb is not None:
            _check_with_duckdb(duckdb, sql)
            return
    _check_textually(sql, LITERAL_READINGS.get(dialect, STANDARD_READINGS))


def _check_with_duckdb(duckdb, sql):
    try:
        statements = duckdb.extract_statements(sql)
    except duckdb.Error as exc:
        raise UnsafeQueryError(f'Query does not parse: {exc}') from exc
    if len(statements) != 1:
        raise UnsafeQueryError(f'Expected one statement, got {len(statements)}')
    if statements[0].type != duckdb.StatementType.SELECT:
        raise UnsafeQueryError(f'Only SELECT is allowed, got {statements[0].type.name}')

    with duckdb.connect() as parser:
        tree = json.loads(parser.execute('SELECT json_serialize_sql(?)', [sql]).fetchone()[0])
    if tree.get('error'):
        raise UnsafeQueryError(tree.get('error_message', 'Query does not parse'))
    _check_tree(tree)


def _check_tree(node):
    if isinstance(node, list):
        for child in node:
            _check_tree(child)
        return
    if not isinstance(node, dict):
        return
    if node.get('cte_map', {}).get('map'):
        raise UnsafeQueryError('WITH is not allowed')
    kind = node.get('type')
    if kind == 'TABLE_FUNCTION':
        raise UnsafeQueryError(f"Table function '{node['function'].get('function_name')}' is not allowed")
    if kind == 'FUNCTION' and node.get('function_name', '').lower() in SESSION_FUNCTIONS:
        raise UnsafeQueryError(f"Function '{node['function_name']}' is not allowed")
    if kind == 'SHOW_REF':
        raise UnsafeQueryError('SHOW, DESCRIBE and SUMMARIZE are not allowed')
    name = node.get('table_name')
    if name and (node.get('schema_name') or node.get('catalog_name') or name.lower() != SOURCE_TABLE):
        raise UnsafeQueryError(f"Only {SOURCE_TABLE} may be queried, not '{name}'")
    for child in node.values():
        _check_tree(child)


def _check_textually(sql, readings):
    # An engine-neutral dialect could end a literal like 'a\' either way
    # (backslash escape or not), so it gets both readings and must pass each.
    for backslash_quotes, raw_literals in readings:
        code = _strip_literals_and_comments(sql, backslash_quotes, raw_literals).strip()
        if code.endswith(';'):
            code = code[:-1]
        if ';' in code:
            raise UnsafeQueryError('Only one statement is allowed')
        if not re.match(r'select\b', code.strip(), re.IGNORECASE):
            raise UnsafeQueryError('Only SELECT is allowed')


def _strip_literals_and_comments(sql, backslash_quotes, raw_literals):
    out = []
    i, n = 0, len(sql)
    while i < n:
        ch = sql[i]
        if sql.startswith('--', i):
            end = sql.find('\n', i)
            i = n if end == -1 else end
        elif sql.startswith('/*', i):
            end = sql.find('*/', i + 2)
            if end == -1:
                raise UnsafeQueryError('Unterminated comment')
            i = end + 2
            out.append(' ')
        elif ch in ("'", '"', '`'):
            # Where r'...' ends depends on whether the r starts a raw literal or
            # ends an identifier. The library never writes one, so refuse it.
            if raw_literals and ch != '`' and i > 0 and sql[i - 1] in 'rR':
                raise UnsafeQueryError('Raw string literals are not allowed')
            i = _skip_quoted(sql, i, ch, ch in backslash_quotes)
            out.append(' ')
        else:
            out.append(ch)
            i += 1
    return ''.join(out)


def _skip_quoted(sql, start, quote, backslash_escapes):
    i, n = start + 1, len(sql)
    while i < n:
        ch = sql[i]
        if backslash_escapes and ch == '\\':
            i += 2
        elif ch == quote:
            if i + 1 < n and sql[i + 1] == quote:
                i += 2
            else:
                return i + 1
        else:
            i += 1
    raise UnsafeQueryError('Unterminated quote')
