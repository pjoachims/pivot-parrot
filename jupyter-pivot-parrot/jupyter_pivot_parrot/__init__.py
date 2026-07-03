"""Jupyter Pivot Parrot - Interactive pivot tables for notebooks."""

import io
import pathlib
import uuid

import anywidget
from traitlets import Bool, Bytes, Dict, Int, List, Unicode


def _table_to_arrow_bytes(table):
    """Serialize a PyArrow table to Arrow IPC stream bytes."""
    import pyarrow as pa

    sink = io.BytesIO()
    with pa.ipc.new_stream(sink, table.schema) as writer:
        writer.write_table(table)
    return sink.getvalue()


def _data_to_arrow_table(data):
    """Convert supported table-like data to a PyArrow table."""
    import pandas as pd
    import pyarrow as pa

    if isinstance(data, pd.DataFrame):
        return pa.Table.from_pandas(data)
    elif hasattr(data, "to_dict"):
        df = pd.DataFrame(data.to_dict("records"))
        return pa.Table.from_pandas(df)
    elif isinstance(data, dict):
        df = pd.DataFrame(data)
        return pa.Table.from_pandas(df)
    elif isinstance(data, list):
        df = pd.DataFrame(data)
        return pa.Table.from_pandas(df)
    else:
        raise ValueError(f"Unsupported data type: {type(data)}")


def _data_to_arrow_bytes(data):
    """Convert supported table-like data to Arrow IPC stream bytes."""
    return _table_to_arrow_bytes(_data_to_arrow_table(data))


def _query_result_to_arrow_table(result):
    """Convert a remote query result to a PyArrow table."""
    import pandas as pd
    import pyarrow as pa

    if isinstance(result, pa.Table):
        return result
    if isinstance(result, pd.DataFrame):
        return pa.Table.from_pandas(result)
    raise ValueError(f"Unsupported query result type: {type(result)}")


def _execute_query(connection, sql, timeout=None):
    """Execute SQL through a duck-typed connection."""
    if not hasattr(connection, "execute_query"):
        raise ValueError("Remote connection must provide execute_query(sql, timeout=None)")

    try:
        result = connection.execute_query(sql, timeout=timeout)
    except TypeError:
        result = connection.execute_query(sql)
    return _query_result_to_arrow_table(result)


def _wrap_pivot_data_query(sql, base_query):
    """Wrap pivot_data references with the configured base query."""
    if "FROM pivot_data" in sql:
        return f"""
        WITH pivot_data AS (
            {base_query}
        )
        {sql}
        """
    return sql


def _schema_fields(table):
    """Extract frontend field descriptors from an Arrow schema."""
    return [{"name": field.name, "type": str(field.type)} for field in table.schema]


def _build_initial_config(rows, columns, values, custom_metrics, custom_filters, custom_groupings, active_filters):
    """Build initial config object."""
    return {
        "config": {
            "rows": rows or [],
            "columns": columns or [],
            "values": values or [],
            "filters": active_filters or [],
            "customMetrics": custom_metrics or [],
            "customFilters": custom_filters or [],
            "customGroupings": custom_groupings or [],
        }
    }


class PivotParrot(anywidget.AnyWidget):
    """
    Render an interactive pivot table in Jupyter.

    Parameters
    ----------
    data : pd.DataFrame or dict or list
        Data for local in-browser DuckDB WASM computation.
    connection : object, optional
        Remote database connection with execute_query(sql, timeout=None).
    query : str, optional
        Remote source query.
    table : str, optional
        Remote source table name, used as SELECT * FROM {table}.
    rows : list of str, optional
        Initial field names for row dimensions. Default: []
    columns : list of str, optional
        Initial field names for column dimensions. Default: []
    values : list of dict, optional
        Initial value fields with aggregations.
    custom_metrics : list of dict, optional
        Custom calculated metrics.
    custom_filters : list of dict, optional
        Custom filter expressions.
    custom_groupings : list of dict, optional
        Custom grouping expressions.
    active_filters : list of dict, optional
        Pre-applied filters.
    height : int, optional
        Widget height in pixels. Default: 600.
    dialect : str, optional
        SQL dialect. Default: 'duckdb'.
    enable_sql_playground : bool, optional
        Enable SQL playground feature. Default: True.
    auto_update : bool, optional
        Initial auto-update setting. Default: True.
    auto_execute : bool, optional
        Auto-select first numeric field with sum aggregation. Default: False.
    """

    _esm = pathlib.Path(__file__).parent / "static" / "widget.js"
    _css = pathlib.Path(__file__).parent / "static" / "widget.css"

    arrow_bytes = Bytes(b"").tag(sync=True)
    initial_config = Dict({}).tag(sync=True)
    config = Dict({}).tag(sync=True)
    instance_key = Unicode("").tag(sync=True)
    height = Int(600).tag(sync=True)
    auto_update = Bool(True).tag(sync=True)
    auto_execute = Bool(False).tag(sync=True)
    enable_sql_playground = Bool(True).tag(sync=True)
    dialect = Unicode("duckdb").tag(sync=True)
    mode = Unicode("local").tag(sync=True)
    fields = List(Dict(), default_value=[]).tag(sync=True)
    sample_data = Bytes(b"").tag(sync=True)
    pivot_timeout = Int(60).tag(sync=True)

    def __init__(
        self,
        data=None,
        *,
        connection=None,
        query=None,
        table=None,
        rows=None,
        columns=None,
        values=None,
        custom_metrics=None,
        custom_filters=None,
        custom_groupings=None,
        active_filters=None,
        pivot_timeout=60,
        **kwargs,
    ):
        is_local = data is not None
        is_remote = connection is not None or query is not None or table is not None

        if is_local and is_remote:
            raise ValueError("Provide either 'data' for local mode or 'connection' with 'query'/'table' for remote mode, not both")
        if not is_local and not is_remote:
            raise ValueError("Must provide 'data' or remote 'connection' with 'query' or 'table'")

        kwargs["initial_config"] = _build_initial_config(
            rows,
            columns,
            values,
            custom_metrics,
            custom_filters,
            custom_groupings,
            active_filters,
        )
        kwargs.setdefault("config", kwargs["initial_config"]["config"])
        kwargs["pivot_timeout"] = pivot_timeout

        self._connection = None
        self._base_query = None

        if is_local:
            kwargs["mode"] = "local"
            kwargs["arrow_bytes"] = _data_to_arrow_bytes(data)
            kwargs.setdefault("instance_key", f"pivot_local_{uuid.uuid4().hex}")
        else:
            if connection is None:
                raise ValueError("Remote mode requires 'connection'")
            if not hasattr(connection, "execute_query"):
                raise ValueError("Remote connection must provide execute_query(sql, timeout=None)")
            if bool(query) == bool(table):
                raise ValueError("Remote mode requires exactly one of 'query' or 'table'")

            base_query = query if query else f"SELECT * FROM {table}"
            fields, sample_data = self._detect_remote_schema(connection, base_query)

            self._connection = connection
            self._base_query = base_query
            kwargs["mode"] = "remote"
            kwargs["fields"] = fields
            kwargs["sample_data"] = sample_data or b""
            kwargs.setdefault("instance_key", f"pivot_remote_{uuid.uuid4().hex}")

        super().__init__(**kwargs)
        self.on_msg(self._handle_frontend_msg)

    def _detect_remote_schema(self, connection, base_query):
        if hasattr(connection, "get_schema"):
            try:
                schema = connection.get_schema(base_query)
                if schema is not None:
                    return list(schema), b""
            except Exception:
                pass

        schema_sql = f"SELECT * FROM ({base_query}) AS subquery LIMIT 1"
        schema_table = _execute_query(connection, schema_sql)
        return _schema_fields(schema_table), _table_to_arrow_bytes(schema_table)

    def _handle_frontend_msg(self, widget, content, buffers):
        if not isinstance(content, dict) or content.get("type") != "execute_query":
            return

        request_id = content.get("requestId")
        try:
            if self._connection is None or self._base_query is None:
                raise ValueError("Remote connection is not configured")

            sql = _wrap_pivot_data_query(content.get("sql", ""), self._base_query)
            result = _execute_query(self._connection, sql, timeout=content.get("timeout"))
            self.send(
                {"type": "query_result", "requestId": request_id, "status": "success"},
                buffers=[_table_to_arrow_bytes(result)],
            )
        except Exception as exc:
            self.send(
                {
                    "type": "query_result",
                    "requestId": request_id,
                    "status": "error",
                    "error": {"message": str(exc), "type": type(exc).__name__},
                }
            )


__version__ = "0.1.0"
__all__ = ["PivotParrot"]
