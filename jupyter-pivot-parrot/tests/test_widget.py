import io

import pytest

pytest.importorskip("anywidget")
pa = pytest.importorskip("pyarrow")
pd = pytest.importorskip("pandas")

from jupyter_pivot_parrot import PivotParrot


class FakeConnection:
    def __init__(self):
        self.queries = []
        self.timeouts = []

    def execute_query(self, sql, timeout=None):
        self.queries.append(sql)
        self.timeouts.append(timeout)
        return pd.DataFrame({"state": ["CA"], "units": [3]})


class ErrorConnection:
    def get_schema(self, query):
        return [{"name": "state", "type": "string"}]

    def execute_query(self, sql, timeout=None):
        raise RuntimeError("database unavailable")


def test_widget_serializes_dataframe_and_builds_initial_config():
    widget = PivotParrot(
        data=pd.DataFrame({"state": ["CA", "AK"], "units": [1, 2]}),
        rows=["state"],
    )

    assert len(widget.arrow_bytes) > 0

    with pa.ipc.open_stream(io.BytesIO(widget.arrow_bytes)) as reader:
        table = reader.read_all()

    assert table.num_rows == 2
    assert widget.initial_config["config"]["rows"] == ["state"]


def test_widget_requires_data():
    with pytest.raises(ValueError, match="Must provide 'data' or remote 'connection'"):
        PivotParrot(data=None)


def test_remote_construction_uses_limit_one_schema_fallback():
    connection = FakeConnection()

    widget = PivotParrot(connection=connection, query="SELECT state, units FROM source")

    assert widget.mode == "remote"
    assert [field["name"] for field in widget.fields] == ["state", "units"]
    assert widget.fields[1]["type"] == "int64"
    assert connection.queries == ["SELECT * FROM (SELECT state, units FROM source) AS subquery LIMIT 1"]
    assert len(widget.sample_data) > 0

    with pa.ipc.open_stream(io.BytesIO(widget.sample_data)) as reader:
        table = reader.read_all()

    assert table.num_rows == 1
    assert table.column_names == ["state", "units"]


def test_remote_execute_query_wraps_pivot_data_and_replies_with_arrow():
    connection = FakeConnection()
    widget = PivotParrot(connection=connection, query="SELECT state, units FROM source")
    replies = []

    def capture_send(content, buffers=None):
        replies.append((content, buffers or []))

    widget.send = capture_send

    widget._handle_frontend_msg(
        widget,
        {
            "type": "execute_query",
            "requestId": "req-1",
            "sql": "SELECT state, SUM(units) AS units FROM pivot_data GROUP BY state",
            "timeout": 12,
        },
        [],
    )

    assert "WITH pivot_data AS" in connection.queries[-1]
    assert "SELECT state, units FROM source" in connection.queries[-1]
    assert "SELECT state, SUM(units) AS units FROM pivot_data GROUP BY state" in connection.queries[-1]
    assert connection.timeouts[-1] == 12

    assert replies[0][0] == {"type": "query_result", "requestId": "req-1", "status": "success"}
    assert len(replies[0][1]) == 1

    with pa.ipc.open_stream(io.BytesIO(replies[0][1][0])) as reader:
        table = reader.read_all()

    assert table.to_pydict() == {"state": ["CA"], "units": [3]}


def test_remote_execute_query_error_replies_with_error_status():
    widget = PivotParrot(connection=ErrorConnection(), query="SELECT state FROM source")
    replies = []

    def capture_send(content, buffers=None):
        replies.append((content, buffers or []))

    widget.send = capture_send

    widget._handle_frontend_msg(
        widget,
        {
            "type": "execute_query",
            "requestId": "req-err",
            "sql": "SELECT * FROM pivot_data",
        },
        [],
    )

    assert replies == [
        (
            {
                "type": "query_result",
                "requestId": "req-err",
                "status": "error",
                "error": {"message": "database unavailable", "type": "RuntimeError"},
            },
            [],
        )
    ]
