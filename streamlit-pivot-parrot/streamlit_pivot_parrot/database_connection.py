"""
Database connection abstraction for pivot-parrot.

Provides a simple wrapper for database connections that returns Arrow Tables.
"""

from abc import ABC, abstractmethod
from typing import Optional
from queue import Queue, Empty
import pyarrow as pa
import pyarrow.ipc as ipc
import logging
import threading
import requests
import time
import io

logger = logging.getLogger(__name__)


# ============================================================
# Timeout Support
# ============================================================

class QueryTimeoutError(Exception):
    """Query exceeded timeout limit."""
    pass


class DatabaseConnection(ABC):
    """
    Abstract base class for database connections.

    Simple interface: execute_query returns Arrow Table directly.
    No pandas conversion needed - efficient Arrow-to-Arrow transfer.
    """

    @abstractmethod
    def execute_query(self, sql: str, timeout: int = None) -> pa.Table:
        """
        Execute a SQL query and return Arrow Table.

        Args:
            sql: SQL query to execute
            timeout: Query timeout in seconds (optional)

        Returns:
            pyarrow.Table with query results

        Raises:
            Exception: If query execution fails
        """
        pass

    def cancel_query(self) -> bool:
        """
        Cancel the currently running query (best effort).

        Returns:
            bool: True if cancellation was attempted, False if not supported
        """
        return False

    def get_schema(self, query: str) -> list:
        """
        Get schema for a query without executing it (optional).

        If implemented, returns schema by analyzing the query structure
        rather than executing it. This is more efficient than LIMIT 1.

        Args:
            query: SQL query to analyze

        Returns:
            List of dicts with 'name' and 'type' keys, or None if not implemented

        Example:
            [{'name': 'id', 'type': 'BIGINT'}, {'name': 'name', 'type': 'STRING'}]
        """
        return None


class DatabricksConnection(DatabaseConnection):
    """
    Wrapper for Databricks SQL connections with optional timeout support.

    Two ways to create:

    1. From credentials:
        conn = DatabricksConnection.from_credentials(
            hostname="xxx.cloud.databricks.com",
            http_path="/sql/1.0/warehouses/abc123",
            token="dapi...",
            default_timeout=30  # seconds, or None to disable
        )

    2. From existing connection:
        raw_conn = sql.connect(...)
        conn = DatabricksConnection(raw_conn)
    """

    def __init__(
        self,
        connection,
        default_timeout: Optional[int] = None,
        # Store credentials for reconnection
        _hostname: Optional[str] = None,
        _http_path: Optional[str] = None,
        _token: Optional[str] = None,
    ):
        """
        Wrap an existing Databricks SQL connection.

        Args:
            connection: databricks.sql.Connection instance
            default_timeout: Default timeout in seconds
        """
        self._connection = connection
        self._default_timeout = default_timeout
        self._current_cursor = None
        self._current_statement_id = None  # For REST API timeout mode
        self._query_lock = threading.Lock()  # Serialize execute_query/cancel_query
        # Store for reconnection after timeout
        self._hostname = _hostname
        self._http_path = _http_path
        self._token = _token

    @property
    def timeout_enabled(self) -> bool:
        """Whether timeout is configured."""
        return self._default_timeout is not None

    @property
    def default_timeout(self) -> Optional[int]:
        """Default timeout in seconds, or None if disabled."""
        return self._default_timeout

    def _reconnect(self):
        """Reconnect after connection was closed (e.g., after timeout)."""
        if not all([self._hostname, self._http_path, self._token]):
            raise Exception("Cannot reconnect: credentials not stored. Use from_credentials() to enable auto-reconnect.")

        from databricks import sql
        logger.debug("[Reconnect] Reconnecting to Databricks...")
        self._connection = sql.connect(
            server_hostname=self._hostname,
            http_path=self._http_path,
            access_token=self._token
        )
        logger.debug("[Reconnect] Reconnected successfully")

    @classmethod
    def from_credentials(
        cls,
        hostname: str,
        http_path: str,
        token: str,
        default_timeout: Optional[int] = 30
    ) -> "DatabricksConnection":
        """
        Create connection from credentials.

        Args:
            hostname: Databricks workspace hostname (e.g., "xxx.cloud.databricks.com")
            http_path: HTTP path for warehouse
            token: Access token (dapi...)
            default_timeout: Default query timeout in seconds (None to disable)

        Returns:
            DatabricksConnection instance
        """
        from databricks import sql

        connection = sql.connect(
            server_hostname=hostname,
            http_path=http_path,
            access_token=token
        )

        return cls(
            connection,
            default_timeout=default_timeout,
            _hostname=hostname,
            _http_path=http_path,
            _token=token
        )

    def execute_query(self, sql_query: str, timeout: Optional[int] = None) -> pa.Table:
        """
        Execute query with optional timeout.

        Args:
            sql_query: SQL query to execute
            timeout: Timeout in seconds. Uses default_timeout if not specified.
                     Pass 0 to explicitly disable timeout for this query.

        Returns:
            pyarrow.Table with results

        Raises:
            QueryTimeoutError: If query exceeds timeout
            Exception: If query execution fails
        """
        with self._query_lock:
            # Determine effective timeout
            if timeout == 0:
                effective_timeout = None  # Explicitly disabled
            elif timeout is not None:
                effective_timeout = timeout
            else:
                effective_timeout = self._default_timeout

            # No timeout: use sync connector (simpler, native Arrow)
            if not effective_timeout:
                return self._execute_sync(sql_query)

            # With timeout: use REST API + threaded polling
            return self._execute_with_timeout(sql_query, effective_timeout)

    def _execute_sync(self, sql_query: str) -> pa.Table:
        """Execute query synchronously using the Databricks connector."""
        # Try to get cursor, reconnect if connection is dead
        try:
            cursor = self._connection.cursor()
        except Exception as e:
            logger.warning(f"[Connection] Failed to get cursor, attempting reconnect: {e}")
            self._reconnect()
            cursor = self._connection.cursor()

        self._current_cursor = cursor

        logger.debug("[Query] Executing query (sync, no timeout)...")
        try:
            cursor.execute(sql_query)
            result = cursor.fetchall_arrow()
            logger.debug(f"[Query] Query completed, got {result.num_rows} rows")
            return result
        finally:
            self._current_cursor = None
            try:
                cursor.close()
            except Exception:
                pass

    @staticmethod
    def _databricks_type_to_arrow(type_name: str) -> pa.DataType:
        """Map Databricks SQL type names to PyArrow types."""
        type_map = {
            'BOOLEAN': pa.bool_(),
            'BYTE': pa.int8(), 'TINYINT': pa.int8(),
            'SHORT': pa.int16(), 'SMALLINT': pa.int16(),
            'INT': pa.int32(), 'INTEGER': pa.int32(),
            'LONG': pa.int64(), 'BIGINT': pa.int64(),
            'FLOAT': pa.float32(),
            'DOUBLE': pa.float64(),
            'STRING': pa.string(),
            'BINARY': pa.binary(),
            'DATE': pa.date32(),
            'TIMESTAMP': pa.timestamp('us'),
            'TIMESTAMP_NTZ': pa.timestamp('us'),
        }
        upper = type_name.upper().strip()
        if upper.startswith('DECIMAL'):
            import re
            match = re.match(r'DECIMAL\((\d+),\s*(\d+)\)', upper)
            if match:
                return pa.decimal128(int(match.group(1)), int(match.group(2)))
            return pa.decimal128(38, 18)
        return type_map.get(upper, pa.string())

    def _execute_with_timeout(self, sql_query: str, timeout: int) -> pa.Table:
        """
        Execute query with timeout using REST API + threaded polling.

        This approach:
        1. Submits query via REST API (returns immediately with statement_id)
        2. Polls for completion in background thread
        3. Can cancel query on Databricks if timeout exceeded
        4. Fetches results as Arrow via presigned URL
        """
        if not all([self._hostname, self._http_path, self._token]):
            raise Exception("Timeout requires credentials. Use from_credentials() to create connection.")

        base_url = f"https://{self._hostname}"
        headers = {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json"
        }
        warehouse_id = self._http_path.split("/")[-1]

        logger.debug(f"[Timeout] Executing query with {timeout}s timeout (REST API mode)...")
        start_time = time.time()

        # 1. Submit query via REST API
        resp = requests.post(
            f"{base_url}/api/2.0/sql/statements",
            headers=headers,
            json={
                "warehouse_id": warehouse_id,
                "statement": sql_query,
                "format": "ARROW_STREAM",
                "disposition": "EXTERNAL_LINKS",
                "wait_timeout": "0s"  # Return immediately
            }
        )
        result = resp.json()
        statement_id = result.get("statement_id")

        if not statement_id:
            raise Exception(f"Failed to submit query: {result}")

        logger.debug(f"[Timeout] Query submitted, statement_id={statement_id}")
        self._current_statement_id = statement_id

        # 2. Poll in background thread
        result_queue = Queue()
        stop_polling = threading.Event()

        def poll_loop():
            while not stop_polling.is_set():
                try:
                    poll_resp = requests.get(
                        f"{base_url}/api/2.0/sql/statements/{statement_id}",
                        headers=headers,
                        timeout=2  # HTTP timeout to avoid endless blocking
                    )
                    data = poll_resp.json()
                    state = data.get("status", {}).get("state")
                    result_queue.put(("state", state, data))
                    if state not in ("PENDING", "RUNNING"):
                        break
                except requests.Timeout:
                    pass  # Just retry
                except Exception as e:
                    result_queue.put(("error", str(e), None))
                    break

        poll_thread = threading.Thread(target=poll_loop, daemon=True)
        poll_thread.start()

        # 3. Main thread: check timeout, read queue
        final_result = None
        try:
            while True:
                elapsed = time.time() - start_time

                # Check timeout
                if elapsed > timeout:
                    logger.warning(f"[Timeout] Query exceeded {timeout}s, cancelling...")
                    stop_polling.set()
                    try:
                        requests.post(
                            f"{base_url}/api/2.0/sql/statements/{statement_id}/cancel",
                            headers=headers
                        )
                        logger.debug("[Timeout] Cancel request sent")
                    except Exception as e:
                        logger.debug(f"[Timeout] Cancel failed: {e}")
                    raise QueryTimeoutError(f"Query timed out after {timeout}s")

                # Check for updates from poll thread (non-blocking)
                try:
                    msg_type, state, data = result_queue.get(timeout=0.1)
                    if msg_type == "state":
                        if state == "SUCCEEDED":
                            final_result = data
                            break
                        elif state in ("FAILED", "CANCELED", "CLOSED"):
                            error = data.get("status", {}).get("error", {}).get("message", "Unknown error")
                            raise Exception(f"Query failed: {error}")
                    elif msg_type == "error":
                        raise Exception(f"Poll error: {state}")
                except Empty:
                    pass  # No message yet, keep waiting

            stop_polling.set()
            poll_thread.join(timeout=5)
            elapsed = time.time() - start_time
            logger.debug(f"[Timeout] Query succeeded in {elapsed:.2f}s")

            # 4. Fetch Arrow data via presigned URL
            external_links = final_result.get("result", {}).get("external_links", [])
            if not external_links:
                # No data returned - build schema from manifest if available
                logger.debug("[Timeout] Query returned no data")
                manifest_columns = final_result.get("manifest", {}).get("schema", {}).get("columns", [])
                if manifest_columns:
                    arrow_fields = []
                    for col in manifest_columns:
                        col_name = col.get("name", f"col_{len(arrow_fields)}")
                        col_type = col.get("type_name", "STRING")
                        arrow_fields.append(pa.field(col_name, self._databricks_type_to_arrow(col_type)))
                    schema = pa.schema(arrow_fields)
                    return pa.table({f.name: pa.array([], type=f.type) for f in schema})
                return pa.table({})

            # Fetch all chunks and concatenate
            tables = []
            for link_info in external_links:
                link = link_info["external_link"]
                arrow_resp = requests.get(link)
                reader = ipc.open_stream(io.BytesIO(arrow_resp.content))
                tables.append(reader.read_all())

            if len(tables) == 1:
                result_table = tables[0]
            else:
                result_table = pa.concat_tables(tables)

            logger.debug(f"[Timeout] Fetched {result_table.num_rows} rows as Arrow")
            return result_table

        finally:
            stop_polling.set()
            try:
                poll_thread.join(timeout=5)
                if poll_thread.is_alive():
                    logger.warning("[Timeout] Poll thread did not terminate within 5s")
            except Exception:
                pass
            self._current_statement_id = None

    def cancel_query(self) -> bool:
        """
        Cancel the currently running query.

        Works for both sync mode (cursor.cancel) and timeout mode (REST API cancel).
        Snapshots state under lock, then cancels outside lock to avoid deadlock
        with a running execute_query().

        Returns:
            bool: True if cancellation was attempted, False otherwise
        """
        cancelled = False

        # Snapshot current state under lock
        with self._query_lock:
            statement_id = self._current_statement_id
            cursor = self._current_cursor

        # Cancel REST API statement (outside lock to avoid deadlock)
        if statement_id and self._hostname and self._token:
            try:
                requests.post(
                    f"https://{self._hostname}/api/2.0/sql/statements/{statement_id}/cancel",
                    headers={"Authorization": f"Bearer {self._token}"}
                )
                logger.debug(f"[Cancel] REST API cancel sent for {statement_id}")
                with self._query_lock:
                    if self._current_statement_id == statement_id:
                        self._current_statement_id = None
                cancelled = True
            except Exception as e:
                logger.debug(f"[Cancel] REST API cancel failed: {e}")

        # Cancel sync cursor (outside lock to avoid deadlock)
        if cursor is not None:
            try:
                cursor.cancel()
                cursor.close()
                with self._query_lock:
                    if self._current_cursor is cursor:
                        self._current_cursor = None
                logger.debug("[Cancel] Cursor cancelled")
                cancelled = True
            except Exception as e:
                logger.debug(f"[Cancel] Cursor cancel failed: {e}")

        return cancelled

    def get_schema(self, query: str) -> list:
        """
        Get schema using DESCRIBE QUERY without executing the query.

        Uses Databricks DESCRIBE QUERY to analyze query structure and return
        schema metadata without scanning data.

        Args:
            query: SQL query to analyze

        Returns:
            List of dicts with 'name' and 'type' keys

        Example:
            [{'name': 'id', 'type': 'BIGINT'}, {'name': 'sales', 'type': 'DOUBLE'}]
        """
        cursor = self._connection.cursor()
        try:
            # DESCRIBE QUERY returns schema without executing
            cursor.execute(f"DESCRIBE QUERY {query}")
            rows = cursor.fetchall()

            # Convert to schema format
            # DESCRIBE QUERY returns: (col_name, data_type, comment)
            schema = []
            for row in rows:
                schema.append({
                    'name': row[0],      # col_name
                    'type': row[1]       # data_type (e.g., 'BIGINT', 'STRING')
                })

            return schema
        finally:
            cursor.close()