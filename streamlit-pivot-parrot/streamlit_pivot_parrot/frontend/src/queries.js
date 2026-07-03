import { Streamlit } from 'streamlit-component-lib';

/**
 * Query execution system for Streamlit remote mode
 *
 * Multi-instance support:
 * - Per-instance query locks (Map keyed by instanceKey)
 * - Multiple pivots can query in parallel
 * - Each pivot can only have one query at a time
 * - Promise-based async queries
 * - Cancel support (frontend triggers, Python cancels on Databricks)
 */

// =============================================================================
// MODULE STATE - Map of pending queries per instance
// =============================================================================

// Map: instanceKey -> { requestId, resolve, reject }
// Allows multiple pivot instances to query in parallel
const pendingQueries = new Map();

// =============================================================================
// HELPER: Generate unique request ID
// =============================================================================

function generateRequestId(instanceKey) {
  return `${instanceKey}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

// =============================================================================
// EXECUTE QUERY - Promise-based with locking
// =============================================================================

/**
 * Execute a remote pivot query
 *
 * This function:
 * 1. Checks query lock for THIS instance (allows parallel queries across instances)
 * 2. Sends request to Python backend via Streamlit
 * 3. Returns promise that resolves when response arrives
 * 4. Can be cancelled via cancelPivotQuery() (Python handles actual cancellation)
 *
 * @param {Object} params
 * @param {string} params.instanceKey - Unique key for this pivot instance
 * @param {string} params.sql - SQL query
 * @returns {Promise<Object>} Promise that resolves with { rows, schema }
 */
export async function executePivotQuery({ instanceKey = 'default', sql, timeout }) {
  const requestId = generateRequestId(instanceKey);

  return new Promise((resolve, reject) => {
    // Check if another query is already running FOR THIS INSTANCE
    // Other instances can query in parallel
    if (pendingQueries.has(instanceKey)) {
      const error = new Error('QUERY_LOCKED');
      error.isQueryLocked = true;
      reject(error);
      return;
    }

    // Acquire lock FOR THIS INSTANCE - store resolve/reject wrapped to release lock
    pendingQueries.set(instanceKey, {
      requestId,
      resolve: (data) => {
        pendingQueries.delete(instanceKey); // Release lock for this instance
        resolve(data);
      },
      reject: (error) => {
        pendingQueries.delete(instanceKey); // Release lock for this instance
        reject(error);
      }
    });

    // Send request to Python backend
    const payload = {
      action: 'execute_query',
      key: instanceKey,
      requestId: requestId,
      sql: sql,
      timeout: timeout ?? null
    };

    Streamlit.setComponentValue(payload);

    // No frontend timeout - Python backend handles timeout via REST API
    // User can cancel via cancelPivotQuery() if needed
  });
}

// =============================================================================
// RESOLVE QUERY - Called when response arrives from Python
// =============================================================================

/**
 * Resolve query results when they arrive from Python
 *
 * Called from StreamlitPivotParrot.jsx when queryResponse arrives
 *
 * @param {string} requestId - Request ID from response
 * @param {Object} data - Query result data { rows, schema }
 * @param {string} instanceKey - Instance key (defaults to 'default')
 * @returns {boolean} True if resolved successfully, false if stale/no pending
 */
export function resolveQueryResults(requestId, data, instanceKey = 'default') {
  const pending = pendingQueries.get(instanceKey);

  if (!pending) {
    return false;
  }

  if (pending.requestId !== requestId) {
    return false;
  }

  pending.resolve(data);
  // resolve() already released lock (see wrapper above)
  return true;
}

// =============================================================================
// REJECT QUERY - Called when error occurs
// =============================================================================

/**
 * Reject query with error
 *
 * Called when query fails or cannot be processed
 *
 * @param {string} requestId - Request ID from error response
 * @param {Error} error - Error object
 * @param {string} instanceKey - Instance key (defaults to 'default')
 * @returns {boolean} True if rejected successfully, false if stale/no pending
 */
export function rejectQueryResults(requestId, error, instanceKey = 'default') {
  const pending = pendingQueries.get(instanceKey);

  if (!pending) {
    return false;
  }

  if (pending.requestId !== requestId) {
    return false;
  }

  pending.reject(error);
  // reject() already released lock (see wrapper above)
  return true;
}

// =============================================================================
// CANCEL QUERY - Request cancellation from Python backend
// =============================================================================

/**
 * Cancel a running query
 *
 * Sends cancel request to Python backend, which cancels via Databricks REST API.
 * Only works when timeout mode is enabled (REST API path).
 *
 * @param {string} instanceKey - Instance key (defaults to 'default')
 * @returns {boolean} True if cancel request was sent, false if no pending query
 */
export function cancelPivotQuery(instanceKey = 'default') {
  const pending = pendingQueries.get(instanceKey);

  if (!pending) {
    // Force clear the lock anyway in case of stale state
    pendingQueries.delete(instanceKey);
    return false;
  }

  // Send cancel request to Python backend
  const payload = {
    action: 'cancel_query',
    key: instanceKey,
    requestId: pending.requestId
  };
  Streamlit.setComponentValue(payload);

  // Reject the pending promise immediately (don't wait for Python confirmation)
  try {
    pending.reject(new Error('Query cancelled by user'));
  } catch (e) {
    // Force clear the lock if reject fails
    pendingQueries.delete(instanceKey);
  }

  return true;
}

// =============================================================================
// UTILITY: Get pending queries (for debugging)
// =============================================================================

export function getPendingQueries() {
  return pendingQueries;
}
