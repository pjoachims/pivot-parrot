"""
Remote backend for pivot-parrot with database connections.

Simple, functional design:
- get_schema_and_cache(): Fetches schema, caches by query signature
- execute_query_request(): Executes SQL using connection stored by key
- No sessions, no UUIDs, no searching - just direct key-based lookup
"""

import base64
import hashlib
import io

import pandas as pd
import pyarrow as pa
import streamlit as st

from .database_connection import DatabaseConnection, DatabricksConnection


def _wrap_connection(connection):
    """
    Auto-detect and wrap a connection if needed.

    Supports:
    - DatabaseConnection instances (already wrapped, return as-is)
    - DB-API connections with cursor() method (Databricks, etc.)
    - Legacy connections with execute_query() method

    Args:
        connection: Database connection of any type

    Returns:
        DatabaseConnection instance

    Raises:
        ValueError: If connection type is not recognized
    """
    # Already wrapped?
    if isinstance(connection, DatabaseConnection):
        return connection

    # Has cursor() method? It's a DB-API connection (Databricks, PostgreSQL, etc.)
    if hasattr(connection, 'cursor'):
        return DatabricksConnection(connection)

    # Has execute_query() method? It's a legacy connection
    if hasattr(connection, 'execute_query'):
        # Wrap legacy connection
        class LegacyWrapper(DatabaseConnection):
            def __init__(self, conn):
                self._conn = conn

            def execute_query(self, sql, timeout=None):
                # Legacy connections don't support timeout, just ignore it
                result = self._conn.execute_query(sql)
                # If it returns a DataFrame, convert to Arrow
                if hasattr(result, 'to_pandas') or isinstance(result, pd.DataFrame):
                    return pa.Table.from_pandas(result)
                # If it's already Arrow, return as-is
                elif isinstance(result, pa.Table):
                    return result
                else:
                    raise ValueError(f"Unsupported result type: {type(result)}")

        return LegacyWrapper(connection)

    raise ValueError(
        f"Unknown connection type: {type(connection)}. "
        f"Connection must have either cursor() or execute_query() method."
    )


def _serialize_arrow_to_base64(arrow_table):
    """
    Serialize Arrow table to base64 string for transfer.

    Args:
        arrow_table: pyarrow.Table

    Returns:
        base64 encoded string
    """
    sink = io.BytesIO()
    with pa.ipc.new_stream(sink, arrow_table.schema) as writer:
        writer.write_table(arrow_table)

    arrow_bytes = sink.getvalue()
    return base64.b64encode(arrow_bytes).decode('utf-8')


def get_schema_and_cache(key, query_sig, connection, base_query):
    """
    Get schema for a query, with caching by query signature.

    Cached at st.session_state[f"pivot_schema_{key}_{query_sig}"].
    If query_sig changes, old cache is abandoned.

    Args:
        key: Component instance key
        query_sig: Signature of the query (hash of query + params)
        connection: Database connection (will be auto-wrapped)
        base_query: SQL query for pivot source

    Returns:
        Dict with fields and optional sampleData
    """
    cache_key = f"pivot_schema_{key}_{query_sig}"
    sig_tracker_key = f"pivot_schema_sig_{key}"

    # Clean up stale cache entry if query_sig changed
    prev_sig = st.session_state.get(sig_tracker_key)
    if prev_sig is not None and prev_sig != query_sig:
        old_cache_key = f"pivot_schema_{key}_{prev_sig}"
        if old_cache_key in st.session_state:
            del st.session_state[old_cache_key]
    st.session_state[sig_tracker_key] = query_sig

    # Check cache
    if cache_key in st.session_state:
        return st.session_state[cache_key]

    # Cache miss - fetch schema
    wrapped_connection = _wrap_connection(connection)

    fields = None
    sample_bytes = None

    # Try to get schema without executing query (if supported)
    if hasattr(wrapped_connection, 'get_schema'):
        try:
            schema = wrapped_connection.get_schema(base_query)
            if schema is not None:
                print(f"✅ Using DESCRIBE QUERY for schema detection")
                fields = schema
                sample_bytes = None
        except Exception as e:
            import warnings
            print(f"⚠️  get_schema() failed: {e}")
            warnings.warn(f"get_schema() failed, falling back to LIMIT 1: {e}")

    # Fallback: Fetch schema with LIMIT 1
    if fields is None:
        import warnings
        warnings.warn("get_schema() not implemented, using LIMIT 1 for schema detection")

        schema_sql = f"SELECT * FROM ({base_query}) AS subquery LIMIT 1"
        schema_arrow = wrapped_connection.execute_query(schema_sql)

        # Extract fields from Arrow schema
        fields = []
        for field in schema_arrow.schema:
            fields.append({
                'name': field.name,
                'type': str(field.type)
            })

        # Serialize sample data
        sample_bytes = _serialize_arrow_to_base64(schema_arrow)

    result = {
        'fields': fields,
        'sampleData': sample_bytes
    }

    # Cache it
    st.session_state[cache_key] = result

    return result


def execute_query_request(key, sql, timeout=None):
    """
    Execute a query request for a given component instance.

    Looks up connection and base_query by key, wraps SQL with CTE if needed,
    executes query, and returns Arrow bytes.

    Args:
        key: Component instance key
        sql: SQL query to execute (complete SQL from React/RemoteDataEngine)
        timeout: Query timeout in seconds (optional)

    Returns:
        Base64-encoded Arrow IPC bytes

    Raises:
        ValueError: If connection or base_query not found
        Exception: Any database or serialization errors
    """
    # Direct lookup by key
    conn_key = f"pivot_conn_{key}"
    query_key = f"pivot_query_{key}"

    if conn_key not in st.session_state:
        raise ValueError(
            f"Connection not found for key '{key}'. "
            f"Ensure pivot_table() is called before query execution."
        )

    if query_key not in st.session_state:
        raise ValueError(
            f"Base query not found for key '{key}'. "
            f"Ensure pivot_table() is called before query execution."
        )

    connection = st.session_state[conn_key]
    base_query = st.session_state[query_key]

    # Wrap base query in CTE if SQL references pivot_data
    if 'FROM pivot_data' in sql:
        sql_with_cte = f"""
        WITH pivot_data AS (
            {base_query}
        )
        {sql}
        """
    else:
        sql_with_cte = sql

    # Execute query
    arrow_table = connection.execute_query(sql_with_cte, timeout=timeout)

    # Serialize to base64
    return _serialize_arrow_to_base64(arrow_table)
