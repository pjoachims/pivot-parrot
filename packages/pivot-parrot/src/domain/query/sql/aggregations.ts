/**
 * Centralized Aggregation Registry
 *
 * Defines aggregation metadata and determines availability based on:
 * 1. Arrow type category (from ArrowTypes)
 * 2. Dialect support (from SQLDialect.aggregations)
 */

import type { ArrowTypeDefinition } from '../../types/ArrowTypes';
import type { SQLDialect } from '../dialects/SQLDialect';

/**
 * Field category enum - matches ArrowTypeDefinition.category
 */
export type FieldCategory = 'integer' | 'float' | 'string' | 'temporal' | 'boolean' | 'complex';

export interface AggregationDefinition {
  key: string;              // Internal key: 'sum', 'avg', 'count'
  value: string;            // Display value for UI: 'Sum', 'Avg', 'Count'
  label: string;            // Display label: 'Sum', 'Average', 'Count'
  sqlName: string;          // SQL function name: 'sum', 'avg', 'count'
  categories: FieldCategory[];
  description?: string;
  tier: 'basic' | 'advanced';  // UI grouping: basic shown by default, advanced collapsed
}

/**
 * All aggregations with their type category constraints
 */
export const AGGREGATIONS: Record<string, AggregationDefinition> = {
  // === Basic tier (shown by default) ===
  sum: {
    key: 'sum',
    value: 'Sum',
    label: 'Sum',
    sqlName: 'sum',
    categories: ['integer', 'float', 'boolean'],
    description: 'Sum of all values',
    tier: 'basic'
  },
  avg: {
    key: 'avg',
    value: 'Avg',
    label: 'Average',
    sqlName: 'avg',
    categories: ['integer', 'float', 'boolean'],
    description: 'Average (mean) of all values',
    tier: 'basic'
  },
  count: {
    key: 'count',
    value: 'Count',
    label: 'Count',
    sqlName: 'count',
    categories: ['integer', 'float', 'string', 'temporal', 'boolean', 'complex'],
    description: 'Count of all rows',
    tier: 'basic'
  },
  count_distinct: {
    key: 'count_distinct',
    value: 'Count Distinct',
    label: 'Count Distinct',
    sqlName: 'count_distinct',
    categories: ['integer', 'float', 'string', 'temporal', 'boolean'],
    description: 'Count of unique values',
    tier: 'basic'
  },
  min: {
    key: 'min',
    value: 'Min',
    label: 'Min',
    sqlName: 'min',
    categories: ['integer', 'float', 'temporal'],
    description: 'Minimum value',
    tier: 'basic'
  },
  max: {
    key: 'max',
    value: 'Max',
    label: 'Max',
    sqlName: 'max',
    categories: ['integer', 'float', 'temporal'],
    description: 'Maximum value',
    tier: 'basic'
  },

  // === Advanced tier (collapsed by default) ===
  median: {
    key: 'median',
    value: 'Median',
    label: 'Median',
    sqlName: 'median',
    categories: ['integer', 'float'],
    description: 'Middle value (50th percentile)',
    tier: 'advanced'
  },
  mode: {
    key: 'mode',
    value: 'Mode',
    label: 'Mode',
    sqlName: 'mode',
    categories: ['string', 'integer'],
    description: 'Most frequent value',
    tier: 'advanced'
  },
  stddev: {
    key: 'stddev',
    value: 'Std Dev',
    label: 'Std Dev',
    sqlName: 'stddev',
    categories: ['integer', 'float'],
    description: 'Standard deviation',
    tier: 'advanced'
  },
  variance: {
    key: 'variance',
    value: 'Variance',
    label: 'Variance',
    sqlName: 'variance',
    categories: ['integer', 'float'],
    description: 'Variance of values',
    tier: 'advanced'
  },
  approx_count_distinct: {
    key: 'approx_count_distinct',
    value: 'Approx Count Distinct',
    label: 'Approx Count Distinct',
    sqlName: 'approx_count_distinct',
    categories: ['integer', 'float', 'string', 'temporal', 'boolean'],
    description: 'Approximate count of unique values (faster)',
    tier: 'advanced'
  }
};

/**
 * Dialect registry key (sqlName) by the aggregation's name in upper case, as the
 * UI writes it ('COUNT DISTINCT', 'STD DEV') or as its key ('COUNT_DISTINCT').
 */
export const AGGREGATION_SQL_NAMES: Record<string, string> = Object.fromEntries(
  Object.values(AGGREGATIONS).flatMap(agg => [
    [agg.value.toUpperCase(), agg.sqlName],
    [agg.key.toUpperCase(), agg.sqlName],
  ])
);

/**
 * Get available aggregations for a field type, filtered by dialect support
 * 
 * @param arrowType - The Arrow type definition for the field
 * @param dialect - The SQL dialect to check for aggregation support (optional)
 * @returns Array of available aggregation definitions
 */
export function getAvailableAggregations(
  arrowType: ArrowTypeDefinition | undefined,
  dialect?: SQLDialect
): AggregationDefinition[] {
  // If no type info, return all aggregations
  if (!arrowType) {
    const all = Object.values(AGGREGATIONS);
    if (!dialect) return all;
    return all.filter(agg => Object.prototype.hasOwnProperty.call(dialect.aggregations, agg.sqlName));
  }

  // Filter by type category
  const byCategory = Object.values(AGGREGATIONS).filter(agg => 
    agg.categories.includes(arrowType.category)
  );

  // Further filter by dialect support
  if (!dialect) return byCategory;
  
  return byCategory.filter(agg => 
    Object.prototype.hasOwnProperty.call(dialect.aggregations, agg.sqlName)
  );
}

/**
 * Get aggregation definition by its display value (e.g., 'Sum', 'Avg')
 */
export function getAggregationByValue(value: string): AggregationDefinition | undefined {
  return Object.values(AGGREGATIONS).find(agg => agg.value === value);
}

/**
 * Get aggregation definition by its key (e.g., 'sum', 'avg')
 */
export function getAggregationByKey(key: string): AggregationDefinition | undefined {
  return AGGREGATIONS[key];
}

/**
 * Get available aggregations grouped by tier (basic vs advanced)
 *
 * @param arrowType - The Arrow type definition for the field
 * @param dialect - The SQL dialect to check for aggregation support (optional)
 * @returns Object with basic and advanced aggregation arrays
 */
export function getAvailableAggregationsByTier(
  arrowType: ArrowTypeDefinition | undefined,
  dialect?: SQLDialect
): { basic: AggregationDefinition[], advanced: AggregationDefinition[] } {
  const all = getAvailableAggregations(arrowType, dialect);
  return {
    basic: all.filter(agg => agg.tier === 'basic'),
    advanced: all.filter(agg => agg.tier === 'advanced')
  };
}
