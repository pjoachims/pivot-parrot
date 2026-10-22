import { DataEngine } from './DataEngine';
import { SQLDialect, DuckDBDialect, DatabricksDialect } from '../../domain/query/dialects/index';
import { fromSchema } from '../../domain/field/FieldItem';

/**
 * RemoteDataEngine - Generic remote backend implementation
 *
 * Uses a callback function to communicate with any remote backend.
 * Useful for Streamlit components or custom backend integrations.
 *
 * Example:
 *   const engine = new RemoteDataEngine({
 *     executeQuery: async (request) => {
 *       const response = await fetch('/api/pivot', {
 *         method: 'POST',
 *         body: JSON.stringify(request)
 *       });
 *       return response.json();
 *     },
 *     sessionId: 'abc-123',
 *     dialect: 'duckdb',
 *     schema: [{name: 'id', type: 'bigint'}, {name: 'name', type: 'string', path: ['Customer']}]
 *   });
 */
export class RemoteDataEngine extends DataEngine {
  public executeQueryCallback: (request: any) => Promise<any>;
  public cancelQueryCallback: (() => void) | null;
  public sessionId: string | null;
  public defaultTimeout: number;
  public currentRequestController: AbortController | null;
  protected _dialect: SQLDialect;
  protected _cachedSchema: any[] | null;
  protected _availableFields: any[] | null;
  protected _detectedTypes: Record<string, string> | null;

  constructor(options: any = {}) {
    super(options); // Initialize base class with cache, tracking, etc.

    if (!options.executeQuery) {
      throw new Error('RemoteDataEngine requires an executeQuery callback function');
    }

    this.executeQueryCallback = options.executeQuery;
    this.cancelQueryCallback = options.cancelQuery || null; // Optional callback to cancel on backend
    this.sessionId = options.sessionId || null;
    this.defaultTimeout = options.timeout || 60000; // 60 seconds default
    this.currentRequestController = null; // For cancellation
    this._cachedSchema = options.schema || null; // Cache schema if provided

    // Initialize SQL dialect based on options
    const dialectType = options.dialect || 'generic';
    this._dialect = this._createDialect(dialectType);

    // If schema provided, prepare fields and types immediately
    this._availableFields = null;
    this._detectedTypes = null;
    if (this._cachedSchema) {
      this._prepareFieldsFromSchema();
    }
  }

  /**
   * Prepare available fields and detected types from schema
   * Called automatically in constructor if schema is provided
   * @private
   */
  _prepareFieldsFromSchema() {
    if (!this._cachedSchema) return;

    // Detect types using dialect
    this._detectedTypes = this._dialect.detectFieldTypes(this._cachedSchema);

    // Create FieldItems with detected types
    this._availableFields = this._cachedSchema.map((col: any) => {
      const detectedType = this._detectedTypes![col.name];
      return fromSchema({
        name: col.name,
        type: detectedType,  // Arrow type (e.g., 'date32', 'int64', 'string')
        originalType: col.type,  // Native database type (e.g., 'DATE', 'BIGINT', 'VARCHAR')
        path: col.path
      });
    });
  }

  /**
   * Create dialect instance from string name
   * @private
   */
  _createDialect(dialectType) {
    switch (dialectType.toLowerCase()) {
      case 'duckdb':
        return new DuckDBDialect();
      case 'databricks':
      case 'spark':  // Alias - Databricks uses Spark SQL
        return new DatabricksDialect();
      case 'generic':
      default:
        return new SQLDialect();  // Conservative base dialect for unknown databases
    }
  }

  /**
   * Get SQL dialect for this remote engine
   * @returns {SQLDialect}
   */
  getDialect() {
    return this._dialect;
  }

  async init() {
    // Remote engines don't need initialization
    // The backend is already running
  }

  /**
   * Execute SQL query implementation (called by base class with mutex)
   * @protected
   * @param {string} sql - SQL query
   * @param {Object} options - Query options
   * @param {string} options.cursor - Pagination cursor
   * @param {number} options.limit - Row limit
   * @param {number} options.offset - Row offset
   * @param {number} options.timeout - Query timeout in milliseconds
   * @returns {Promise<Object>} Query result: { data, dtypes, rowCount, columnCount, nextCursor, hasMore }
   */
  async _executeQueryImpl(sql, options: { cursor?: string; limit?: number; offset?: number; timeout?: number; format?: string } = {}) {
    const request = {
      action: 'executeQuery',
      sessionId: this.sessionId,
      sql,
      useCache: true,
      cursor: options.cursor,
      limit: options.limit,
      offset: options.offset,
      timeout: options.timeout ? Math.floor(options.timeout / 1000) : undefined // Convert ms to seconds
    };

    // Setup timeout and cancellation
    const timeout = options.timeout || this.defaultTimeout;
    const controller = new AbortController();
    this.currentRequestController = controller;

    const timeoutId = setTimeout(() => {
      controller.abort();
      // Also notify backend to cancel the query
      if (this.cancelQueryCallback) {
        try {
          this.cancelQueryCallback();
        } catch {
          // Ignore cancel errors
        }
      }
    }, timeout);

    try {
      // Execute with timeout
      const response = await Promise.race([
        this.executeQueryCallback(request),
        new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(new Error('Query cancelled or timed out'));
          });
        })
      ]);

      clearTimeout(timeoutId);
      this.currentRequestController = null;

      // Get raw data (support both { rows, schema } and plain array)
      const rawData = response.data || response;
      const schema = rawData.schema || null;
      const rows = rawData.rows || rawData;

      // Extract dtypes from Arrow schema
      const dtypes = {};
      const dialect = this.getDialect();

      if (schema && schema.fields) {
        for (const field of schema.fields) {
          // Check for Decimal type with precision/scale properties (Arrow JS)
          // field.type.toString() returns just "Decimal128" without params,
          // but precision/scale are available as properties
          const fieldType = field.type;
          if (fieldType && typeof fieldType.precision === 'number' && typeof fieldType.scale === 'number') {
            dtypes[field.name] = `decimal<${fieldType.precision},${fieldType.scale}>`;
          } else {
            dtypes[field.name] = dialect.detectArrowType(fieldType?.toString?.() || 'string');
          }
        }
      }

      // Arrow path: only honored if the host callback already handed us a
      // decoded Arrow Table (rawData.table) - we don't parse Arrow IPC bytes
      // ourselves (that would need apache-arrow as a runtime dependency).
      // Otherwise silently fall back to the row-shaped result below; callers
      // adapt to either shape via columnarResult.ts.
      if (options.format === 'arrow' && rawData.table) {
        return {
          table: rawData.table,
          dtypes,
          rowCount: response.rowCount || rawData.table.numRows,
          columnCount: response.columnCount || rawData.table.numCols,
          nextCursor: response.nextCursor || null,
          hasMore: response.hasMore || false,
          totalRows: response.totalRows || null
        };
      }

      return {
        data: rows,  // Keep raw values (BigInt, etc.)
        dtypes,      // Column name → DTYPE enum
        rowCount: response.rowCount || (rows?.length || 0),
        columnCount: response.columnCount || (rows?.[0] && schema?.fields ? schema.fields.length : (rows?.[0] ? Object.keys(rows[0]).length : 0)),
        nextCursor: response.nextCursor || null,
        hasMore: response.hasMore || false,
        totalRows: response.totalRows || null
      };
    } catch (error) {
      clearTimeout(timeoutId);
      this.currentRequestController = null;
      throw error;
    }
  }

  /**
   * Cancel the current running query
   * Aborts the client-side request and optionally notifies the backend
   * @returns {boolean} True if a cancel was attempted
   */
  cancelCurrentQuery() {
    let cancelled = false;

    // Abort client-side request if active
    if (this.currentRequestController) {
      this.currentRequestController.abort();
      this.currentRequestController = null;
      cancelled = true;
    }

    // Always notify backend to cancel (e.g., Databricks REST API cancel)
    // This is important for auto-cancel timeout scenarios where the
    // controller might already be cleared but query is still running on backend
    if (this.cancelQueryCallback) {
      try {
        this.cancelQueryCallback();
        cancelled = true;
      } catch {
        // Ignore cancel errors
      }
    }

    return cancelled;
  }

  /**
   * Check if cancel is supported (backend callback provided)
   * @returns {boolean} True if cancel is supported
   */
  canCancel() {
    return !!this.cancelQueryCallback;
  }

  /**
   * Get table schema from remote backend
   * @param {string} tableName - Table name
   * @returns {Promise<Array>} Schema definition
   */
  async getSchema(tableName = this.defaultTable) {
    // Return cached schema if available (e.g., provided by Streamlit)
    if (this._cachedSchema) {
      if (!this._availableFields || !this._detectedTypes) {
        this._prepareFieldsFromSchema();
      }
      return this._cachedSchema;
    }

    const request = {
      action: 'getSchema',
      sessionId: this.sessionId,
      tableName
    };

    const response = await this.executeQueryCallback(request);
    const schema = response.schema || response;

    // Cache the schema for future calls
    this._cachedSchema = schema;
    this._prepareFieldsFromSchema();

    return schema;
  }

  // getUniqueValues() and executeDrilldown() inherited from base class

  /**
   * Get available fields prepared from schema
   * Returns immediately if schema was provided in constructor
   */
  getAvailableFields() {
    if (this._cachedSchema && !this._availableFields) {
      this._prepareFieldsFromSchema();
    }
    return this._availableFields;
  }

  /**
   * Get detected types prepared from schema
   * Returns immediately if schema was provided in constructor
   */
  getDetectedTypes() {
    if (this._cachedSchema && !this._detectedTypes) {
      this._prepareFieldsFromSchema();
    }
    return this._detectedTypes;
  }

  /**
   * Detect field types - delegates to dialect for accurate type mapping
   * @param {Array} schema - Schema from getSchema()
   * @returns {Object} Field type mapping
   */
  detectFieldTypes(schema) {
    // Delegate to dialect for proper type detection
    // (e.g., DatabricksDialect handles Spark SQL types, DuckDBDialect handles DuckDB types)
    if (this._dialect && typeof this._dialect.detectFieldTypes === 'function') {
      return this._dialect.detectFieldTypes(schema);
    }

    // Fallback: simple type detection if dialect doesn't implement it
    const types = {};
    schema.forEach(col => {
      types[col.name] = col.type || 'string';
    });
    return types;
  }

  async close() {
    // Optionally notify backend of session end
    if (this.sessionId) {
      try {
        await this.executeQueryCallback({
          action: 'closeSession',
          sessionId: this.sessionId
        });
      } catch {
        // Ignore errors on close
      }
    }
  }
}
