/**
 * Resolve custom metric references in formulas
 * Supports {{ metric_name }} syntax
 */

/**
 * Extract all metric references from a formula
 * @param {string} formula - Formula with {{ references }}
 * @returns {Array<string>} Array of referenced metric names
 */
export function extractMetricReferences(formula) {
  const regex = /\{\{\s*([^}]+)\s*\}\}/g;
  const references = [];
  let match;

  while ((match = regex.exec(formula)) !== null) {
    references.push(match[1].trim());
  }

  return references;
}

/**
 * Resolve metric references in a formula
 * @param {string} formula - Formula with {{ references }}
 * @param {Array} allMetrics - All custom metrics with {name, expr}
 * @param {Set} visitedMetrics - For circular dependency detection
 * @returns {string} Resolved formula with SQL expressions
 */
export function resolveMetricReferences(formula, allMetrics, visitedMetrics = new Set()) {
  const references = extractMetricReferences(formula);

  if (references.length === 0) {
    return formula; // No references to resolve
  }

  let resolvedFormula = formula;

  for (const refName of references) {
    // Check for circular dependency
    if (visitedMetrics.has(refName)) {
      throw new Error(`Circular dependency detected: ${refName} references itself`);
    }

    // Find the referenced metric
    const referencedMetric = allMetrics.find(m => m.name === refName);

    if (!referencedMetric) {
      throw new Error(`Metric "${refName}" not found. Make sure it's defined before referencing it.`);
    }

    // Recursively resolve the referenced metric
    const newVisited = new Set(visitedMetrics);
    newVisited.add(refName);

    const resolvedExpr = resolveMetricReferences(
      referencedMetric.expr,
      allMetrics,
      newVisited
    );

    // Replace {{ refName }} with (resolvedExpr)
    // Wrap in parentheses to preserve order of operations
    const regex = new RegExp(`\\{\\{\\s*${escapeRegex(refName)}\\s*\\}\\}`, 'g');
    resolvedFormula = resolvedFormula.replace(regex, `(${resolvedExpr})`);
  }

  return resolvedFormula;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate and resolve all metrics
 * Returns metrics with both original and resolved expressions
 * @param {Array} metrics - Array of {name, expr, ...}
 * @returns {Array} Metrics with {name, expr, resolvedExpr, ...}
 */
export function resolveAllMetrics(metrics) {
  return metrics.map(metric => {
    try {
      const resolvedExpr = resolveMetricReferences(metric.expr, metrics);
      return {
        ...metric,
        resolvedExpr
      };
    } catch (error) {
      return {
        ...metric,
        resolvedExpr: metric.expr,
        error: error.message
      };
    }
  });
}
