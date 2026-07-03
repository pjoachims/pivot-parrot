# Streamlit Pivot Parrot Tests

Test suite for the Streamlit integration, including simulation of Streamlit's unique execution model.

## Test Architecture

### `StreamlitTestHarness` (test_streamlit_messaging.py)

Simulates Streamlit's execution model without requiring a running Streamlit server:

- **Rerun loop**: Simulates `st.rerun()` by re-executing the function
- **Session state**: Mocks `st.session_state` with dict-like object that persists across reruns
- **Component communication**: Mocks `_component_func()` to simulate user interactions
- **Request/response tracking**: Records all component calls and allows injecting responses

#### Example Usage

```python
harness = StreamlitTestHarness()

# Inject a user action (query request)
harness.inject_component_response({
    'action': 'execute_query',
    'requestId': 'test-123',
    'sql': 'SELECT * FROM pivot_data'
})

# Run with rerun loop simulation
results = harness.run_with_reruns(
    _pivot_remote,
    connection=mock_conn,
    query="SELECT * FROM test",
    # ... other params
)

# Verify the response
assert harness.component_calls[-1]['queryResponse']['status'] == 'success'
```

## Test Files

### `test_streamlit_messaging.py`
Integration tests for the full Streamlit messaging protocol:
- Initial setup and session creation
- Query execution flow (request → execute → response)
- Error handling and error response format
- Request deduplication
- Rerun loop behavior

### `test_remote_backend.py`
Unit tests for the `remote_backend` module:
- Base query generation
- Arrow serialization
- Query execution with CTE wrapping
- Schema detection
- Error cases

### `conftest.py`
Shared fixtures:
- `sample_dataframe`: Test DataFrame with typical pivot data
- `mock_connection`: Mock database connection factory

## Running Tests

### Run all tests
```bash
cd streamlit-pivot-parrot
pytest
```

### Run specific test file
```bash
pytest tests/test_remote_backend.py
```

### Run specific test
```bash
pytest tests/test_remote_backend.py::test_execute_query_request_success
```

### Run with verbose output
```bash
pytest -v
```

### Run only unit tests (fast)
```bash
pytest -m unit
```

## Key Features Tested

### 1. **Request/Response Protocol**
- Remote render params: `sessionConfig`, `componentConfig`, `engineConfig`, `userPreferences`
- Query responses: `{requestId, status, error?}` + optional `cubeResults`
- Request IDs for matching requests to responses

### 2. **Error Handling**
- Errors are caught and formatted as structured responses
- Error responses include message and type
- No data sent on error (cubeResults absent)

### 3. **State Management**
- Minimal state (6 keys instead of 7+)
- Send-once for sample data and config
- Query signature change detection

### 4. **Deduplication**
- Successful requests are tracked by ID
- Duplicate requests are skipped
- Failed requests can be retried

## Test Coverage

The tests cover:
- ✅ Initial setup and session creation
- ✅ Sample data and schema loading
- ✅ Query execution success path
- ✅ Query execution error path
- ✅ Request deduplication
- ✅ CTE wrapping for base queries
- ✅ Arrow serialization/deserialization
- ✅ Streamlit rerun loop behavior
- ✅ Session state persistence

## Implementation Notes

### Why Mock Streamlit?

Streamlit has a unique execution model where the entire script reruns on every interaction. Testing this requires:
1. Simulating the rerun loop
2. Persisting session state across reruns
3. Injecting user interactions (component responses)
4. Preventing infinite loops (max_reruns limit)

The `StreamlitTestHarness` handles all of this, making it possible to write deterministic tests for the messaging system.

### Testing Strategy

**Unit tests** (`test_remote_backend.py`):
- Test pure functions without Streamlit
- Fast, no complex mocking
- Focus on data transformations and business logic

**Integration tests** (`test_streamlit_messaging.py`):
- Test the full request/response cycle
- Simulate Streamlit execution model
- Test error handling end-to-end
- Verify state management

## Future Improvements

Potential additions:
- [ ] Test concurrent requests (should be blocked)
- [ ] Test session timeout/cleanup
- [ ] Test query parameter changes (reinitializing session)
- [ ] Performance tests (large datasets)
- [ ] Test different SQL dialects (DuckDB, Databricks, Spark)
- [ ] Test drilldown queries
- [ ] Test unique values queries
