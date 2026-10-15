"""
The remote backend runs SQL that arrives from the browser, so it must refuse
anything but a single SELECT over pivot_data. Executed against a real DuckDB.
"""

import sys
from pathlib import Path
from unittest.mock import patch

import pytest

duckdb = pytest.importorskip('duckdb')

sys.path.insert(0, str(Path(__file__).parent.parent))

from streamlit_pivot_parrot.remote_backend import execute_query_request  # noqa: E402

PIVOT_SQL = (
    'SELECT region AS region, CAST(GROUPING(region) AS INTEGER) AS _grouping_region, '
    'SUM(sales) AS sum_sales FROM pivot_data GROUP BY CUBE(region) '
    'ORDER BY region NULLS LAST'
)


class DuckDBConnection:
    def __init__(self, con):
        self.con = con

    def execute_query(self, sql, timeout=None):
        return self.con.execute(sql).fetch_arrow_table()


@pytest.fixture
def con():
    con = duckdb.connect()
    con.execute("CREATE TABLE source AS SELECT * FROM (VALUES ('A', 10), ('B', 20)) t(region, sales)")
    con.execute("CREATE TABLE secrets AS SELECT 'hunter2' AS password")
    return con


def run(con, sql, dialect='duckdb'):
    session_state = {
        'pivot_conn_k': DuckDBConnection(con),
        'pivot_query_k': 'SELECT * FROM source',
        'pivot_dialect_k': dialect,
    }
    with patch('streamlit_pivot_parrot.remote_backend.st') as mock_st:
        mock_st.session_state = session_state
        return execute_query_request(key='k', sql=sql)


def test_pivot_select_runs(con):
    assert run(con, PIVOT_SQL)
    assert run(con, PIVOT_SQL, dialect='databricks')


def test_copy_is_rejected(con, tmp_path):
    target = tmp_path / 'leak.csv'
    with pytest.raises(ValueError):
        run(con, f"COPY secrets TO '{target}'")
    assert not target.exists()


def test_attach_is_rejected(con, tmp_path):
    with pytest.raises(ValueError):
        run(con, f"ATTACH '{tmp_path / 'other.db'}' AS other")
    assert con.execute("SELECT count(*) FROM duckdb_databases() WHERE database_name = 'other'").fetchone()[0] == 0


def test_read_csv_is_rejected(con, tmp_path):
    secret = tmp_path / 'secret.csv'
    secret.write_text('token\nabc\n')
    with pytest.raises(ValueError):
        run(con, f"SELECT * FROM read_csv('{secret}')")
    with pytest.raises(ValueError):
        run(con, f"SELECT * FROM '{secret}'")


def test_other_tables_are_rejected(con):
    with pytest.raises(ValueError):
        run(con, 'SELECT * FROM pivot_data JOIN secrets ON true')
    with pytest.raises(ValueError):
        run(con, 'SELECT * FROM pivot_data WHERE EXISTS (SELECT 1 FROM main.secrets)')


def test_multiple_statements_are_rejected(con):
    with pytest.raises(ValueError):
        run(con, 'SELECT * FROM pivot_data; DROP TABLE secrets')
    assert con.execute('SELECT count(*) FROM secrets').fetchone()[0] == 1


@pytest.mark.parametrize('sql', [
    'SELECT * FROM pivot_data; DROP TABLE secrets',
    'DROP TABLE secrets',
    'WITH x AS (SELECT 1) DELETE FROM secrets',
    '/* SELECT */ DELETE FROM secrets',
])
def test_textual_fallback_rejects_non_select(con, sql):
    with pytest.raises(ValueError):
        run(con, sql, dialect='databricks')
    assert con.execute('SELECT count(*) FROM secrets').fetchone()[0] == 1


def test_generic_dialect_rejects_a_literal_that_ends_differently_per_engine(con):
    with pytest.raises(ValueError):
        run(con, "SELECT 'a\\'; DROP TABLE secrets; --' FROM pivot_data", dialect='generic')
    assert con.execute('SELECT count(*) FROM secrets').fetchone()[0] == 1


def test_textual_fallback_keeps_semicolons_inside_literals(con):
    assert run(con, "SELECT * FROM pivot_data WHERE region <> 'a;b'", dialect='databricks')


@pytest.mark.parametrize('sql', ['SHOW TABLES', 'DESCRIBE secrets', 'SUMMARIZE secrets', 'SELECT * FROM (SUMMARIZE secrets)'])
def test_catalog_introspection_is_rejected(con, sql):
    with pytest.raises(ValueError):
        run(con, sql)
