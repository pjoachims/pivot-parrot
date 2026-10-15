"""
Streamlit Pivot Parrot - Interactive pivot tables for Streamlit

A powerful, Excel-like pivot table component powered by DuckDB WASM.
"""

import os
import logging
import streamlit.components.v1 as components

logger = logging.getLogger(__name__)

parent_dir = os.path.dirname(os.path.abspath(__file__))
build_dir = os.path.join(parent_dir, "frontend/build")
_component_func = components.declare_component("pivot_parrot", path=build_dir)


def pivot_table(
    data=None,
    connection=None,
    query=None,
    table=None,
    sample_size=1000,
    rows=None,
    columns=None,
    values=None,
    custom_metrics=None,
    custom_filters=None,
    custom_groupings=None,
    active_filters=None,
    key=None,
    height=1000,
    pivot_timeout=60,
    unique_values_timeout=20,
    drilldown_timeout=30,
    dialect='duckdb',
    enable_sql_playground=True,
    auto_update=None,
    auto_execute=False,
    locale='en-US',
    field_name_overrides=None
):
    """
    Display an interactive pivot table in Streamlit.

    Supports two modes:
    1. Client-side: Pass data directly (small datasets, <10k rows)
    2. Remote: Pass connection + query/table (large datasets, queries backend)

    Parameters
    ----------
    data : pd.DataFrame or dict or list, optional
        Direct data for client-side mode
    connection : DatabaseConnection, optional
        Database connection for remote mode (must have execute_query(sql) method).
        It only ever receives a single SELECT over the source (sql_guard);
        outside the 'duckdb' dialect that check is textual, so connect as a
        principal that can read the source and nothing else.
    query : str, optional
        SQL query to create pivot source (remote mode only)
    table : str, optional
        Table name to pivot (remote mode only)
    sample_size : int, optional
        Number of rows to fetch as sample in remote mode. Default: 1000
    rows : list of str, optional
        Initial field names for row dimensions. Default: []
    columns : list of str, optional
        Initial field names for column dimensions. Default: []
    values : list of dict, optional
        Initial value fields with aggregations
    custom_metrics : list of dict, optional
        Custom calculated metrics
    custom_filters : list of dict, optional
        Custom filter expressions
    custom_groupings : list of dict, optional
        Custom grouping expressions
    active_filters : list of dict, optional
        Pre-applied filters
    key : str, optional
        Unique key for this component instance. If you have multiple pivot tables
        on the same page, you must provide a unique key for each one.
    height : int, optional
        Component height in pixels. Default: 1000
    pivot_timeout : int, optional
        Timeout for pivot queries in seconds. Default: 60
    unique_values_timeout : int, optional
        Timeout for unique values (filter dropdown) queries in seconds. Default: 20
    drilldown_timeout : int, optional
        Timeout for drilldown queries in seconds. Default: 30
    dialect : str, optional
        SQL dialect ('duckdb', 'databricks', 'spark', 'generic'). Default: 'duckdb'
    enable_sql_playground : bool, optional
        Enable SQL playground feature. Default: True
    auto_update : bool, optional
        Initial auto-update setting. User can toggle this in the UI, and the
        preference persists across Streamlit reruns. Default: True
    auto_execute : bool, optional
        Auto-select first numeric field with sum aggregation. Default: False
    locale : str, optional
        BCP 47 locale for numbers, dates and CSV export, e.g. 'de-DE'. Default: 'en-US'
    field_name_overrides : dict of str to str, optional
        Display names by field id, e.g. {'revenue': 'Umsatz'}. Default: none
    """
    # Determine mode
    if connection and (query or table):
        return _pivot_remote(
            connection=connection,
            query=query,
            table=table,
            sample_size=sample_size,
            rows=rows,
            columns=columns,
            values=values,
            custom_metrics=custom_metrics,
            custom_filters=custom_filters,
            custom_groupings=custom_groupings,
            active_filters=active_filters,
            key=key,
            height=height,
            pivot_timeout=pivot_timeout,
            unique_values_timeout=unique_values_timeout,
            drilldown_timeout=drilldown_timeout,
            dialect=dialect,
            enable_sql_playground=enable_sql_playground,
            auto_update=False if auto_update is None else auto_update,
            auto_execute=auto_execute,
            locale=locale,
            field_name_overrides=field_name_overrides
        )
    elif data is not None:
        return _pivot_local(
            data=data,
            rows=rows,
            columns=columns,
            values=values,
            custom_metrics=custom_metrics,
            custom_filters=custom_filters,
            custom_groupings=custom_groupings,
            active_filters=active_filters,
            key=key,
            height=height,
            dialect=dialect,
            enable_sql_playground=enable_sql_playground,
            auto_update=True if auto_update is None else auto_update,
            auto_execute=auto_execute,
            locale=locale,
            field_name_overrides=field_name_overrides
        )
    else:
        raise ValueError("Must provide either 'data' or 'connection' with 'query'/'table'")


def _pivot_local(
    data,
    rows=None,
    columns=None,
    values=None,
    custom_metrics=None,
    custom_filters=None,
    custom_groupings=None,
    active_filters=None,
    key=None,
    height=1000,
    dialect='duckdb',
    enable_sql_playground=True,
    auto_update=True,
    auto_execute=False,
    locale='en-US',
    field_name_overrides=None
):
    """Local mode: All computation in browser with DuckDB WASM"""
    import pyarrow as pa
    import pandas as pd
    import base64
    import io

    # Convert data to Arrow bytes
    if isinstance(data, pd.DataFrame):
        table = pa.Table.from_pandas(data)
    elif hasattr(data, 'to_dict'):
        df = pd.DataFrame(data.to_dict('records'))
        table = pa.Table.from_pandas(df)
    elif isinstance(data, dict):
        df = pd.DataFrame(data)
        table = pa.Table.from_pandas(df)
    elif isinstance(data, list):
        df = pd.DataFrame(data)
        table = pa.Table.from_pandas(df)
    else:
        raise ValueError(f"Unsupported data type: {type(data)}")

    # Serialize to Arrow IPC bytes
    sink = io.BytesIO()
    with pa.ipc.new_stream(sink, table.schema) as writer:
        writer.write_table(table)
    arrow_bytes_b64 = base64.b64encode(sink.getvalue()).decode('utf-8')

    # Build params
    stable_key = key or 'pivot_local'

    params = {
        'sessionConfig': {
            'mode': 'local',
            'instanceKey': stable_key
        },
        'componentConfig': {
            'height': height,
            'locale': locale
        },
        'engineConfig': {
            'dialect': dialect,
            'enableSQLPlayground': enable_sql_playground
        },
        'userPreferences': {
            'autoUpdate': auto_update,
            'autoExecute': auto_execute
        },
        'arrowBytes': arrow_bytes_b64,
        'initial_config': _build_initial_config(
            rows, columns, values, custom_metrics, custom_filters,
            custom_groupings, active_filters, field_name_overrides
        ),
        'key': stable_key,
        'default': None
    }

    return _component_func(**params)


def _pivot_remote(
    connection,
    query=None,
    table=None,
    sample_size=1000,
    rows=None,
    columns=None,
    values=None,
    custom_metrics=None,
    custom_filters=None,
    custom_groupings=None,
    active_filters=None,
    key=None,
    height=1000,
    pivot_timeout=60,
    unique_values_timeout=20,
    drilldown_timeout=30,
    dialect='duckdb',
    enable_sql_playground=True,
    auto_update=True,
    auto_execute=False,
    locale='en-US',
    field_name_overrides=None
):
    """Remote mode: Server-side query execution"""
    import streamlit as st
    import hashlib
    from .remote_backend import get_schema_and_cache, execute_query_request, _wrap_connection

    # =========================================================================
    # 1. SETUP CONNECTION AND QUERY
    # =========================================================================

    stable_key = key or 'default'

    # Get base query
    base_query = query if query else f"SELECT * FROM {table}" if table else None
    if not base_query:
        raise ValueError("Must provide either 'query' or 'table'")

    # Query signature for cache invalidation
    query_sig = hashlib.md5(f"{base_query}|{sample_size}".encode()).hexdigest()

    # Store connection and base_query by key (for query execution)
    wrapped_connection = _wrap_connection(connection)
    st.session_state[f"pivot_conn_{stable_key}"] = wrapped_connection
    st.session_state[f"pivot_query_{stable_key}"] = base_query
    st.session_state[f"pivot_dialect_{stable_key}"] = dialect

    # Check if connection supports timeout (for cancel button in frontend)
    timeout_enabled = getattr(wrapped_connection, 'timeout_enabled', False)

    # Get schema (cached by query signature)
    schema_result = get_schema_and_cache(
        key=stable_key,
        query_sig=query_sig,
        connection=connection,
        base_query=base_query
    )

    # =========================================================================
    # 2. BUILD COMPONENT PARAMS
    # =========================================================================

    params = {
        'sessionConfig': {
            'mode': 'remote',
            'instanceKey': stable_key,
            'fields': schema_result['fields']
        },
        'componentConfig': {
            'height': height,
            'pivotTimeout': pivot_timeout * 1000,
            'uniqueValuesTimeout': unique_values_timeout * 1000,
            'drilldownTimeout': drilldown_timeout * 1000,
            'timeoutEnabled': timeout_enabled,
            'locale': locale
        },
        'engineConfig': {
            'dialect': dialect,
            'enableSQLPlayground': enable_sql_playground
        },
        'userPreferences': {
            'autoUpdate': auto_update,
            'autoExecute': auto_execute
        },
        'sampleData': schema_result['sampleData'],
        'initial_config': _build_initial_config(
            rows, columns, values, custom_metrics, custom_filters,
            custom_groupings, active_filters, field_name_overrides
        ),
        'key': stable_key,
        'default': None
    }

    # =========================================================================
    # 3. CHECK FOR PENDING RESULT (if we just executed a query)
    # =========================================================================

    result_key = f"pivot_result_{stable_key}"
    if result_key in st.session_state:
        pending = st.session_state[result_key]
        params['queryResponse'] = {
            'requestId': pending['requestId'],
            'status': pending['status']
        }
        if pending.get('error'):
            params['queryResponse']['error'] = pending['error']
        if pending.get('data'):
            params['cubeResults'] = pending['data']

        # Clear after sending (one-time delivery)
        del st.session_state[result_key]

    # =========================================================================
    # 4. CALL COMPONENT
    # =========================================================================

    result = _component_func(**params)

    # =========================================================================
    # 5. HANDLE QUERY REQUEST (if React sent one)
    # =========================================================================

    if result and result.get('action') == 'execute_query':
        request_id = result.get('requestId')
        sql = result.get('sql')
        timeout = result.get('timeout')

        # Validate request
        if not request_id:
            logger.error("Missing requestId in query request")
            return result

        if not sql:
            logger.error(f"Missing or empty SQL in request {request_id}")
            # Mark as processed to avoid infinite loop
            st.session_state[f"pivot_last_request_{stable_key}"] = request_id
            return result

        # Check if already processed (idempotency)
        last_request_key = f"pivot_last_request_{stable_key}"
        if st.session_state.get(last_request_key) == request_id:
            logger.debug(f"Skipping duplicate request {request_id}")
            return result

        # Execute query
        logger.debug(f"Executing query: {request_id}")
        try:
            arrow_bytes = execute_query_request(
                key=stable_key,
                sql=sql,
                timeout=timeout
            )

            # Cache result for delivery on next rerun
            st.session_state[result_key] = {
                'requestId': request_id,
                'status': 'success',
                'data': arrow_bytes
            }
            st.session_state[last_request_key] = request_id
            logger.debug(f"Query successful: {request_id}")

        except Exception as e:
            # Cache error for delivery on next rerun
            st.session_state[result_key] = {
                'requestId': request_id,
                'status': 'error',
                'error': {
                    'message': str(e),
                    'type': type(e).__name__
                }
            }
            st.session_state[last_request_key] = request_id
            logger.error(f"Query failed: {request_id} - {str(e)}", exc_info=True)

        # Rerun to deliver result
        st.rerun()

    # =========================================================================
    # 6. HANDLE CANCEL REQUEST (if React sent one)
    # =========================================================================

    if result and result.get('action') == 'cancel_query':
        request_id = result.get('requestId')
        logger.debug(f"Cancel request received: {request_id}")

        # Cancel the query on the connection
        try:
            conn = st.session_state.get(f"pivot_conn_{stable_key}")
            if conn and hasattr(conn, 'cancel_query'):
                cancelled = conn.cancel_query()
                logger.debug(f"Query cancelled: {cancelled}")
            else:
                logger.warning("Connection does not support cancel_query")
        except Exception as e:
            logger.error(f"Cancel failed: {e}")

        # No rerun needed - frontend already rejected the promise

    return result


def _build_initial_config(rows, columns, values, custom_metrics, custom_filters, custom_groupings, active_filters, field_name_overrides=None):
    """Build initial config object"""
    return {
        'config': {
            'rows': rows or [],
            'columns': columns or [],
            'values': values or [],
            'filters': active_filters or [],
            'customMetrics': custom_metrics or [],
            'customFilters': custom_filters or [],
            'customGroupings': custom_groupings or [],
            'fieldNameOverrides': field_name_overrides or {}
        }
    }


__version__ = "0.1.0"

# Import database connection classes
from .database_connection import (
    DatabaseConnection,
    DatabricksConnection,
    QueryTimeoutError,
)

__all__ = [
    "pivot_table",
    "DatabaseConnection",
    "DatabricksConnection",
    "QueryTimeoutError",
]
