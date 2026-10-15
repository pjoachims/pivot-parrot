"""
Tests for the current Streamlit request/response flow used by _pivot_remote().
"""

import sys
from pathlib import Path
from unittest.mock import Mock, patch

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent))


class SessionState(dict):
    """Minimal stand-in for streamlit.session_state."""


class MockConnection:
    """Legacy execute_query() connection accepted by _pivot_remote()."""

    def __init__(self, dataframe=None):
        self.dataframe = dataframe or pd.DataFrame({'region': ['North'], 'revenue': [100]})

    def execute_query(self, sql):
        return self.dataframe


def run_remote_pivot(session_state, component_result=None, **kwargs):
    """Execute _pivot_remote() with Streamlit and component calls patched."""
    import streamlit
    from streamlit_pivot_parrot import _pivot_remote

    component_calls = []

    def component_stub(**component_kwargs):
        component_calls.append(component_kwargs)
        return component_result

    rerun = Mock()

    with patch.object(streamlit, 'session_state', session_state, create=True), \
         patch.object(streamlit, 'rerun', rerun, create=True), \
         patch('streamlit_pivot_parrot._component_func', side_effect=component_stub):
        result = _pivot_remote(**kwargs)

    return result, component_calls, rerun


def test_initial_render_uses_current_component_contract():
    """Initial remote render should send schema + preferences using the current shape."""
    schema_result = {
        'fields': [{'name': 'region', 'type': 'string'}],
        'sampleData': 'encoded-sample'
    }
    session_state = SessionState()

    with patch('streamlit_pivot_parrot.remote_backend.get_schema_and_cache', return_value=schema_result):
        _result, calls, rerun = run_remote_pivot(
            session_state=session_state,
            component_result=None,
            connection=MockConnection(),
            query='SELECT * FROM sales',
            key='sales',
            auto_update=False,
            auto_execute=True
        )

    first_call = calls[0]

    assert rerun.call_count == 0
    assert first_call['sessionConfig'] == {
        'mode': 'remote',
        'instanceKey': 'sales',
        'fields': schema_result['fields']
    }
    assert first_call['sampleData'] == 'encoded-sample'
    assert first_call['userPreferences'] == {
        'autoUpdate': False,
        'autoExecute': True
    }
    assert 'pivot_conn_sales' in session_state
    assert session_state['pivot_query_sales'] == 'SELECT * FROM sales'


def test_execute_query_request_is_cached_for_next_rerun():
    """Frontend execute_query requests should be executed, cached, and trigger rerun."""
    schema_result = {
        'fields': [{'name': 'region', 'type': 'string'}],
        'sampleData': None
    }
    session_state = SessionState()

    with patch('streamlit_pivot_parrot.remote_backend.get_schema_and_cache', return_value=schema_result), \
         patch('streamlit_pivot_parrot.remote_backend.execute_query_request', return_value='encoded-result') as execute_query:
        request = {
            'action': 'execute_query',
            'requestId': 'req-1',
            'sql': 'SELECT region, SUM(revenue) FROM pivot_data GROUP BY region',
            'timeout': 15
        }
        result, _calls, rerun = run_remote_pivot(
            session_state=session_state,
            component_result=request,
            connection=MockConnection(),
            query='SELECT * FROM sales',
            key='sales'
        )

    assert result == request
    assert rerun.call_count == 1
    execute_query.assert_called_once_with(
        key='sales',
        sql='SELECT region, SUM(revenue) FROM pivot_data GROUP BY region',
        timeout=15
    )
    assert session_state['pivot_result_sales'] == {
        'requestId': 'req-1',
        'status': 'success',
        'data': 'encoded-result'
    }
    assert session_state['pivot_last_request_sales'] == 'req-1'


def test_pending_query_result_is_delivered_once():
    """Cached query results should be sent once and then removed from session_state."""
    schema_result = {
        'fields': [{'name': 'region', 'type': 'string'}],
        'sampleData': None
    }
    session_state = SessionState({
        'pivot_result_sales': {
            'requestId': 'req-1',
            'status': 'success',
            'data': 'encoded-result'
        }
    })

    with patch('streamlit_pivot_parrot.remote_backend.get_schema_and_cache', return_value=schema_result):
        _result, calls, rerun = run_remote_pivot(
            session_state=session_state,
            component_result=None,
            connection=MockConnection(),
            query='SELECT * FROM sales',
            key='sales'
        )

    assert rerun.call_count == 0
    assert calls[0]['queryResponse'] == {
        'requestId': 'req-1',
        'status': 'success'
    }
    assert calls[0]['cubeResults'] == 'encoded-result'
    assert 'pivot_result_sales' not in session_state


def test_cancel_request_calls_connection_cancel():
    """cancel_query actions should invoke cancel_query() when supported."""
    schema_result = {
        'fields': [{'name': 'region', 'type': 'string'}],
        'sampleData': None
    }
    session_state = SessionState()
    connection = MockConnection()
    wrapped_connection = Mock(cancel_query=Mock(return_value=True))

    with patch('streamlit_pivot_parrot.remote_backend.get_schema_and_cache', return_value=schema_result), \
         patch('streamlit_pivot_parrot.remote_backend._wrap_connection', return_value=wrapped_connection):
        request = {
            'action': 'cancel_query',
            'requestId': 'req-2'
        }
        result, _calls, rerun = run_remote_pivot(
            session_state=session_state,
            component_result=request,
            connection=connection,
            query='SELECT * FROM sales',
            key='sales'
        )

    assert result == request
    assert rerun.call_count == 0
    wrapped_connection.cancel_query.assert_called_once_with()


def test_locale_and_field_name_overrides_reach_the_component():
    from streamlit_pivot_parrot import pivot_table

    schema_result = {'fields': [{'name': 'region', 'type': 'string'}], 'sampleData': 'encoded-sample'}
    calls = []
    with patch('streamlit_pivot_parrot.remote_backend.get_schema_and_cache', return_value=schema_result), \
         patch('streamlit_pivot_parrot._component_func', side_effect=lambda **kw: calls.append(kw)), \
         patch('streamlit.session_state', SessionState(), create=True):
        pivot_table(connection=MockConnection(), query='SELECT * FROM sales', key='remote',
                    locale='de-DE', field_name_overrides={'region': 'Region'})
        pivot_table(data=pd.DataFrame({'region': ['North']}), key='local',
                    locale='de-DE', field_name_overrides={'region': 'Region'})

    for call in calls:
        assert call['componentConfig']['locale'] == 'de-DE'
        assert call['initial_config']['config']['fieldNameOverrides'] == {'region': 'Region'}
