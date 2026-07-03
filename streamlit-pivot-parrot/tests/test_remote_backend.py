"""
Unit tests for the current remote_backend module.
"""

import base64
import io
import sys
from pathlib import Path
from unittest.mock import patch

import pandas as pd
import pyarrow as pa
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))


def decode_arrow_bytes(encoded: str) -> pa.Table:
    """Decode a base64 Arrow IPC payload back into a table."""
    raw = base64.b64decode(encoded)
    return pa.ipc.open_stream(io.BytesIO(raw)).read_all()


class LegacyConnection:
    """Legacy execute_query() connection returning pandas DataFrames."""

    def __init__(self, dataframe: pd.DataFrame):
        self.dataframe = dataframe
        self.calls = []

    def execute_query(self, sql):
        self.calls.append(sql)
        return self.dataframe


def test_wrap_connection_converts_legacy_dataframes(sample_dataframe):
    """Legacy execute_query() connections should be normalized to Arrow tables."""
    from streamlit_pivot_parrot.remote_backend import _wrap_connection

    wrapped = _wrap_connection(LegacyConnection(sample_dataframe))
    result = wrapped.execute_query("SELECT * FROM sales")

    assert isinstance(result, pa.Table)
    assert result.num_rows == len(sample_dataframe)


def test_serialize_arrow_to_base64_round_trips(sample_dataframe):
    """Arrow IPC serialization should preserve the table contents."""
    from streamlit_pivot_parrot.remote_backend import _serialize_arrow_to_base64

    table = pa.Table.from_pandas(sample_dataframe)
    encoded = _serialize_arrow_to_base64(table)
    decoded = decode_arrow_bytes(encoded)

    assert isinstance(encoded, str)
    assert decoded.schema.names == table.schema.names
    assert decoded.num_rows == table.num_rows


def test_get_schema_and_cache_uses_cache(sample_dataframe):
    """Schema lookups should populate and re-use session-state cache entries."""
    from streamlit_pivot_parrot.remote_backend import get_schema_and_cache

    session_state = {}
    connection = LegacyConnection(sample_dataframe)

    with patch('streamlit_pivot_parrot.remote_backend.st') as mock_st:
        mock_st.session_state = session_state

        result_1 = get_schema_and_cache(
            key='sales',
            query_sig='sig-1',
            connection=connection,
            base_query='SELECT * FROM sales'
        )
        result_2 = get_schema_and_cache(
            key='sales',
            query_sig='sig-1',
            connection=connection,
            base_query='SELECT * FROM sales'
        )

    assert result_1 == result_2
    assert connection.calls == ['SELECT * FROM (SELECT * FROM sales) AS subquery LIMIT 1']
    assert result_1['fields'][0]['name'] == 'region'
    assert result_1['sampleData'] is not None


def test_execute_query_request_wraps_pivot_data_queries(sample_dataframe):
    """Queries against pivot_data should be wrapped in a CTE using the stored base query."""
    from streamlit_pivot_parrot.remote_backend import _wrap_connection, execute_query_request

    connection = LegacyConnection(sample_dataframe)
    session_state = {
        'pivot_conn_sales': _wrap_connection(connection),
        'pivot_query_sales': 'SELECT * FROM original_table WHERE active = true',
    }

    with patch('streamlit_pivot_parrot.remote_backend.st') as mock_st:
        mock_st.session_state = session_state
        encoded = execute_query_request(
            key='sales',
            sql='SELECT region, SUM(revenue) FROM pivot_data GROUP BY region'
        )

    decoded = decode_arrow_bytes(encoded)

    assert connection.calls
    assert 'WITH pivot_data AS' in connection.calls[0]
    assert 'SELECT * FROM original_table WHERE active = true' in connection.calls[0]
    assert decoded.num_rows == len(sample_dataframe)


def test_execute_query_request_forwards_timeout(sample_dataframe):
    """Explicit timeouts should be passed to wrapped DatabaseConnection implementations."""
    from streamlit_pivot_parrot.database_connection import DatabaseConnection
    from streamlit_pivot_parrot.remote_backend import execute_query_request

    table = pa.Table.from_pandas(sample_dataframe)

    class RecordingConnection(DatabaseConnection):
        def __init__(self):
            self.calls = []

        def execute_query(self, sql, timeout=None):
            self.calls.append((sql, timeout))
            return table

    connection = RecordingConnection()
    session_state = {
        'pivot_conn_sales': connection,
        'pivot_query_sales': 'SELECT * FROM sales',
    }

    with patch('streamlit_pivot_parrot.remote_backend.st') as mock_st:
        mock_st.session_state = session_state
        execute_query_request(key='sales', sql='SELECT * FROM pivot_data', timeout=9)

    assert len(connection.calls) == 1
    sql, timeout = connection.calls[0]
    assert timeout == 9
    assert 'WITH pivot_data AS' in sql
    assert 'SELECT * FROM sales' in sql


def test_execute_query_request_requires_registered_connection():
    """Missing session-state entries should raise a clear error."""
    from streamlit_pivot_parrot.remote_backend import execute_query_request

    with patch('streamlit_pivot_parrot.remote_backend.st') as mock_st:
        mock_st.session_state = {}

        with pytest.raises(ValueError, match="Connection not found for key 'missing'"):
            execute_query_request(key='missing', sql='SELECT * FROM pivot_data')
