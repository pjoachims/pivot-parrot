"""
The widget runs SQL that arrives from the browser, so it must refuse anything
but a single SELECT over pivot_data. Executed against a real DuckDB.
"""

import pytest

pytest.importorskip("anywidget")
pytest.importorskip("pyarrow")
duckdb = pytest.importorskip("duckdb")

from jupyter_pivot_parrot import PivotParrot

PIVOT_SQL = (
    "SELECT region AS region, CAST(GROUPING(region) AS INTEGER) AS _grouping_region, "
    "SUM(sales) AS sum_sales FROM pivot_data GROUP BY CUBE(region) "
    "ORDER BY region NULLS LAST"
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


def run(con, sql, dialect="duckdb"):
    widget = PivotParrot(connection=DuckDBConnection(con), query="SELECT * FROM source", dialect=dialect)
    replies = []
    widget.send = lambda content, buffers=None: replies.append(content)
    widget._handle_frontend_msg(widget, {"type": "execute_query", "requestId": "r", "sql": sql}, [])
    return replies[0]["status"]


def test_pivot_select_runs(con):
    assert run(con, PIVOT_SQL) == "success"
    assert run(con, PIVOT_SQL, dialect="databricks") == "success"


def test_copy_is_rejected(con, tmp_path):
    target = tmp_path / "leak.csv"
    assert run(con, f"COPY secrets TO '{target}'") == "error"
    assert not target.exists()


def test_attach_is_rejected(con, tmp_path):
    assert run(con, f"ATTACH '{tmp_path / 'other.db'}' AS other") == "error"
    assert con.execute("SELECT count(*) FROM duckdb_databases() WHERE database_name = 'other'").fetchone()[0] == 0


def test_read_csv_is_rejected(con, tmp_path):
    secret = tmp_path / "secret.csv"
    secret.write_text("token\nabc\n")
    assert run(con, f"SELECT * FROM read_csv('{secret}')") == "error"
    assert run(con, f"SELECT * FROM '{secret}'") == "error"


def test_other_tables_are_rejected(con):
    assert run(con, "SELECT * FROM pivot_data JOIN secrets ON true") == "error"


@pytest.mark.parametrize("dialect", ["duckdb", "databricks"])
def test_multiple_statements_are_rejected(con, dialect):
    assert run(con, "SELECT * FROM pivot_data; DROP TABLE secrets", dialect) == "error"
    assert con.execute("SELECT count(*) FROM secrets").fetchone()[0] == 1


def test_generic_dialect_rejects_a_literal_that_ends_differently_per_engine(con):
    assert run(con, "SELECT 'a\\'; DROP TABLE secrets; --' FROM pivot_data", "generic") == "error"
    assert con.execute("SELECT count(*) FROM secrets").fetchone()[0] == 1


@pytest.mark.parametrize("sql", ["SHOW TABLES", "DESCRIBE secrets", "SUMMARIZE secrets"])
def test_catalog_introspection_is_rejected(con, sql):
    assert run(con, sql) == "error"


def test_frontend_cannot_switch_to_the_weaker_check(con, tmp_path):
    secret = tmp_path / "secret.csv"
    secret.write_text("token\nabc\n")
    widget = PivotParrot(connection=DuckDBConnection(con), query="SELECT * FROM source")
    replies = []
    widget.send = lambda content, buffers=None: replies.append(content)

    widget.dialect = "databricks"  # the dialect traitlet syncs, so the browser can write it
    widget._handle_frontend_msg(widget, {"type": "execute_query", "requestId": "r", "sql": f"SELECT * FROM read_csv('{secret}')"}, [])
    assert replies[0]["status"] == "error"
