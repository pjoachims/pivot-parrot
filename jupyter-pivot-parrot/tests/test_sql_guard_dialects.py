"""
What the guard lets through per dialect, checked on the guard alone: the
textual check must read string literals the way the declared engine does.
"""

import importlib.util
from pathlib import Path

import pytest

_path = next(Path(__file__).parent.parent.glob('*_pivot_parrot/sql_guard.py'))
_spec = importlib.util.spec_from_file_location('sql_guard', _path)
guard = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(guard)


@pytest.mark.parametrize('dialect', ['databricks', 'spark'])
@pytest.mark.parametrize('sql', [
    "SELECT * FROM pivot_data WHERE name = 'O\\'Brien'",
    "SELECT * FROM pivot_data WHERE name LIKE '%O\\'Brien%'",
    "SELECT * FROM pivot_data WHERE path = 'C:\\\\'",
])
def test_databricks_accepts_backslash_escaped_quotes(sql, dialect):
    guard.ensure_safe_query(sql, dialect)


@pytest.mark.parametrize('dialect', ['databricks', 'spark'])
@pytest.mark.parametrize('sql', [
    "SELECT r'a\\' ; DROP TABLE t; --' FROM pivot_data",
    'SELECT R"a\\" ; DROP TABLE t; --" FROM pivot_data',
    'SELECT "a\\" , "; DROP TABLE t; --" FROM pivot_data',
    "SELECT 1 FROM pivot_data; DROP TABLE t",
])
def test_databricks_rejects_a_second_statement_behind_a_literal(sql, dialect):
    with pytest.raises(guard.UnsafeQueryError):
        guard.ensure_safe_query(sql, dialect)


@pytest.mark.parametrize('sql', [
    "SELECT 'a\\' ; DROP TABLE t; --' FROM pivot_data",
    "SELECT 'a\\'' ; DROP TABLE t; --' FROM pivot_data",
])
def test_generic_must_be_safe_under_both_escape_readings(sql):
    with pytest.raises(guard.UnsafeQueryError):
        guard.ensure_safe_query(sql, 'generic')


@pytest.mark.parametrize('sql', [
    "SELECT getvariable('secret') FROM pivot_data",
    "SELECT current_setting('home_directory') FROM pivot_data",
    "SELECT * FROM pivot_data WHERE region = CURRENT_SETTING('s3_region')",
    "SELECT main.getvariable('secret') FROM pivot_data",
])
def test_duckdb_rejects_session_lookups(sql):
    pytest.importorskip('duckdb')
    with pytest.raises(guard.UnsafeQueryError):
        guard.ensure_safe_query(sql, 'duckdb')


@pytest.mark.parametrize('sql', [
    "SELECT xr'\\'' ; DROP TABLE t; --' FROM pivot_data",
    "SELECT * FROM pivot_data WHERE a = r'x'",
])
def test_databricks_refuses_raw_literals(sql):
    with pytest.raises(guard.UnsafeQueryError):
        guard.ensure_safe_query(sql, 'databricks')
