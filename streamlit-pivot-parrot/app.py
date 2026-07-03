import logging
import os

import streamlit as st
from streamlit_pivot_parrot import DatabricksConnection

# Setup logging to see timeout logs
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main():
    st.set_page_config(page_title="Databricks Timeout Demo", page_icon="🦜", layout="wide")
    st.title("Pivot + Databricks Timeout Support")

    with st.sidebar:
        server_hostname = st.text_input(
            "Server Hostname",
            value=os.environ.get("DATABRICKS_SERVER_HOSTNAME", ""),
            placeholder="dbc-xxxxxxxx-xxxx.cloud.databricks.com",
        )
        http_path = st.text_input(
            "HTTP Path",
            value=os.environ.get("DATABRICKS_HTTP_PATH", ""),
            placeholder="/sql/1.0/warehouses/…",
        )
        access_token = st.text_input(
            "Access Token",
            value=os.environ.get("DATABRICKS_TOKEN", ""),
            type="password",
            placeholder="dapi…",
        )

        st.divider()
        st.subheader("Timeout Settings")
        default_timeout = st.number_input(
            "Default Query Timeout (seconds)",
            min_value=0,
            max_value=300,
            value=30,
            help="0 = no timeout"
        )

        st.divider()
        default_query = """SELECT *, 222 :: decimal(35, 19) as test FROM `databricks_simulated_retail_customer_data`.`v01`.`customers`"""

        query = st.text_area("SQL Query", value=default_query, height=200)
        sample_size = st.slider("Sample Size", 100, 10000, 1000)

        if st.button("🔄 Reset Connection", use_container_width=True):
            # Clear connection to recreate with new timeout settings
            if "connection" in st.session_state:
                del st.session_state.connection
            st.session_state.pivot_key_counter = st.session_state.get("pivot_key_counter", 0) + 1
            st.rerun()

    # Create connection with timeout support
    if "connection" not in st.session_state:
        try:
            logger.info(f"Creating DatabricksConnection with timeout={default_timeout}s")

            # Use from_credentials for timeout support
            conn = DatabricksConnection.from_credentials(
                hostname=server_hostname,
                http_path=http_path,
                token=access_token,
                default_timeout=default_timeout if default_timeout > 0 else None
            )

            st.session_state.connection = conn
            logger.info(f"Connection created: timeout_enabled={conn.timeout_enabled}, default_timeout={conn.default_timeout}s")
            st.success(f"Connected with timeout support (default: {conn.default_timeout}s)")
        except Exception as e:
            logger.error(f"Failed to connect: {e}")
            st.error(f"Failed to initialize: {e}")
            st.stop()

    from streamlit_pivot_parrot import pivot_table

    pivot_key = f"databricks_pivot_{st.session_state.get('pivot_key_counter', 0)}"

    pivot_table(
        connection=st.session_state.connection,
        query=query,
        sample_size=sample_size,
        key=pivot_key,
        height=700,
        auto_update=True,
        dialect="databricks",
    )


if __name__ == "__main__":
    main()
