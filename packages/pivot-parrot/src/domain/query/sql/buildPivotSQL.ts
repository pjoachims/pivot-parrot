/**
 * buildPivotSQL - Pure domain function to generate pivot SQL from config
 *
 * This is the main entry point for SQL generation. It:
 * 1. Enriches values with custom metric details
 * 2. Builds WHERE filters (dimension filters)
 * 3. Builds HAVING filters (aggregation filters)
 * 4. Generates the final CUBE SQL
 *
 * No UI dependencies, no state - pure business logic.
 */

import type { SQLDialect } from '../dialects/SQLDialect';
import { buildCubeSQL } from './buildCubeSQL';
import { buildFieldItemFilters } from './sql-builder';
import { buildFilter } from './filters';
import type { FieldItem } from '../../field/FieldItem';
import { getFieldById } from '../../field/getFieldById';
import { resolveFieldExpr } from '../../field/resolveFieldExpr';
import { FieldKind } from '../../models/types';
import type { PivotTableConfig } from '../../models/types';

/**
 * Options for building pivot SQL
 */
export interface BuildPivotSQLOptions {
  /** The pivot table configuration */
  config: PivotTableConfig;

  /** SQL dialect for generation */
  dialect: SQLDialect;

  /** All available fields for field resolution */
  availableFields: FieldItem[];

  /** Field type mapping (fieldName → type) */
  detectedTypes: Record<string, string>;

  /** Table name to query. Default: 'pivot_data' */
  tableName?: string;

  /** Disable subtotals - use regular GROUP BY instead of CUBE. Default: false
   * TBD: Consider removing this option - subtotals could be hidden at display level instead */
  disableSubtotals?: boolean;
}

/**
 * Result of building pivot SQL
 */
export interface BuildPivotSQLResult {
  /** The generated SQL string */
  sql: string;
}


/**
 * Enrich values with custom metric details
 */
function enrichValues(
  values: PivotTableConfig['values'],
  customMetrics: PivotTableConfig['customMetrics']
): PivotTableConfig['values'] {
  return values.map(v => {
    if (v.isCustom) {
      const metric = (customMetrics || []).find(m => m.id === v.field);
      if (metric) {
        return { ...v, name: metric.name, expr: metric.expr, format: metric.format };
      }
    }
    return v;
  });
}

/**
 * Build WHERE and HAVING filters from config
 */
function buildFilters(
  config: PivotTableConfig,
  enrichedValues: PivotTableConfig['values'],
  dialect: SQLDialect,
  availableFields: FieldItem[]
): { whereFilters: any[]; havingFilters: any[] } {
  // Build base WHERE filters
  const whereFilters = buildFieldItemFilters(
    config.filters || [],
    dialect,
    availableFields,
    config
  );

  const havingFilters: any[] = [];

  // Classify filters as WHERE or HAVING based on field kind
  (config.filters || [])
    .filter(f =>
      f.value !== undefined ||
      (f.selectedValues && f.selectedValues.length > 0) ||
      (f.betweenStart !== undefined && f.betweenEnd !== undefined)
    )
    .forEach(f => {
      const fieldItem = getFieldById(f.field, availableFields, config);

      const isHaving =
        f.filterType === 'having' ||
        fieldItem?.kind === FieldKind.AGGREGATION ||
        fieldItem?.kind === FieldKind.CUSTOM_METRIC;

      if (isHaving) {
        let fieldExpr: string;
        // The metric's current formula: the filter's copy dates from when it was added.
        const formula = fieldItem?.formula ?? f.formula;

        if (formula) {
          fieldExpr = formula;
        } else if (f.aggregation && f.sourceField) {
          fieldExpr = dialect.aggregate(f.aggregation, resolveFieldExpr(f.sourceField, availableFields, config, dialect));
        } else {
          throw new Error(`HAVING filter missing enriched data: ${JSON.stringify(f)}`);
        }

        const sqlExpr = buildFilter({
          ...f,
          field: fieldExpr,
          dtype: fieldItem?.dtype
        }).toSQL(dialect, false);

        if (sqlExpr) {
          havingFilters.push({
            field: f.field,
            sqlExpr: sqlExpr,
            filterType: f.type
          });
        }
      }
    });

  return { whereFilters, havingFilters };
}

/**
 * Build pivot SQL from configuration
 *
 * @example
 * ```typescript
 * const result = buildPivotSQL({
 *   config: pivotConfig,
 *   dialect: new DuckDBDialect(),
 *   availableFields: fields,
 *   detectedTypes: types
 * });
 *
 * console.log(result.sql);
 * // SELECT ... FROM pivot_data GROUP BY CUBE(...) ...
 * ```
 */
export function buildPivotSQL(options: BuildPivotSQLOptions): BuildPivotSQLResult {
  const {
    config,
    dialect,
    availableFields,
    detectedTypes,
    tableName = 'pivot_data',
    disableSubtotals = false
  } = options;

  // Step 1: Enrich values with custom metric details
  const enrichedValues = enrichValues(config.values, config.customMetrics);

  // Step 2: Build WHERE and HAVING filters
  const { whereFilters, havingFilters } = buildFilters(
    config,
    enrichedValues,
    dialect,
    availableFields
  );

  // Step 3: Generate SQL
  const sql = buildCubeSQL(
    { ...config, values: enrichedValues },
    whereFilters,
    detectedTypes,
    tableName,
    dialect,
    availableFields,
    havingFilters,
    disableSubtotals
  );

  return { sql };
}

/**
 * Simple wrapper that just returns the SQL string
 * Convenience function for common use case
 */
export function buildSQL(options: BuildPivotSQLOptions): string {
  return buildPivotSQL(options).sql;
}
