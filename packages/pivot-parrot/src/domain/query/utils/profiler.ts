/**
 * Simple performance profiler for tracking pivot operations
 * Similar to Python's cProfile but for JavaScript
 *
 * Usage:
 *   import { profiler } from './profiler';
 *
 *   // Wrap synchronous function
 *   const result = profiler.profile('myOperation', () => {
 *     // ... your code
 *     return result;
 *   });
 *
 *   // Wrap async function
 *   const result = await profiler.profileAsync('myAsyncOp', async () => {
 *     // ... your async code
 *     return result;
 *   });
 *
 *   // Get performance report
 *   console.table(profiler.getReport());
 *
 *   // Reset all timings
 *   profiler.reset();
 */

class Profiler {
  public timings: Map<string, number[]>;
  public enabled: boolean;
  public verbose: boolean;

  constructor() {
    this.timings = new Map(); // operation name → array of durations
    this.enabled = true;
    this.verbose = false; // Set to true to log each operation
  }

  /**
   * Profile a synchronous function
   * @param {string} name - Operation name
   * @param {Function} fn - Function to profile
   * @returns {*} Result of the function
   */
  profile(name, fn) {
    if (!this.enabled) return fn();

    const start = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - start;
      this._recordTiming(name, duration);

      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this._recordTiming(name, duration);
      throw error;
    }
  }

  /**
   * Profile an async function
   * @param {string} name - Operation name
   * @param {Function} fn - Async function to profile
   * @returns {Promise<*>} Result of the async function
   */
  async profileAsync(name, fn) {
    if (!this.enabled) return await fn();

    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this._recordTiming(name, duration);

      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this._recordTiming(name, duration);
      throw error;
    }
  }

  /**
   * Start a manual timing (for complex code that can't be wrapped)
   * @param {string} name - Operation name
   * @returns {Function} Stop function - call this to end timing
   */
  start(name) {
    if (!this.enabled) return () => {};

    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this._recordTiming(name, duration);
    };
  }

  /**
   * Record a timing
   * @private
   */
  _recordTiming(name, duration) {
    if (!this.timings.has(name)) {
      this.timings.set(name, []);
    }
    this.timings.get(name).push(duration);
  }

  /**
   * Get performance report with statistics
   * @returns {Object} Report object with stats for each operation
   */
  getReport() {
    const report = {};

    for (const [name, durations] of this.timings.entries()) {
      const count = durations.length;
      const total = durations.reduce((a, b) => a + b, 0);
      const avg = total / count;
      const min = Math.min(...durations);
      const max = Math.max(...durations);

      report[name] = {
        count,
        avg: `${avg.toFixed(2)}ms`,
        min: `${min.toFixed(2)}ms`,
        max: `${max.toFixed(2)}ms`,
        total: `${total.toFixed(2)}ms`
      };
    }

    return report;
  }

  /**
   * Get formatted report as string (for console.log)
   * @returns {string} Formatted report
   */
  getReportString() {
    const report = this.getReport();
    const lines = ['Performance Report:', ''];

    // Calculate column widths
    const names = Object.keys(report);
    const maxNameLen = Math.max(...names.map(n => n.length), 10);

    // Header
    lines.push(
      `${'Operation'.padEnd(maxNameLen)}  Count   Avg       Min       Max       Total`
    );
    lines.push('-'.repeat(maxNameLen + 60));

    // Sort by total time (descending)
    const sorted = names.sort((a, b) => {
      const aTotal = parseFloat(report[a].total);
      const bTotal = parseFloat(report[b].total);
      return bTotal - aTotal;
    });

    // Rows
    for (const name of sorted) {
      const stats = report[name];
      lines.push(
        `${name.padEnd(maxNameLen)}  ${stats.count.toString().padEnd(5)}  ` +
        `${stats.avg.padEnd(9)}  ${stats.min.padEnd(9)}  ` +
        `${stats.max.padEnd(9)}  ${stats.total}`
      );
    }

    return lines.join('\n');
  }

  /**
   * Print report to console
   */
  printReport() {
  }

  /**
   * Print report as table (if console.table is available)
   */
  printTable() {
    // eslint-disable-next-line no-console -- prints on request
    console.table(this.getReport());
  }

  /**
   * Reset all timings
   */
  reset() {
    this.timings.clear();
  }

  /**
   * Enable profiling
   */
  enable() {
    this.enabled = true;
  }

  /**
   * Disable profiling (zero overhead when disabled)
   */
  disable() {
    this.enabled = false;
  }

  /**
   * Enable verbose mode (logs each operation)
   */
  setVerbose(verbose) {
    this.verbose = verbose;
  }

  /**
   * Get raw timing data
   * @returns {Map} Map of operation name → array of durations (in ms)
   */
  getRawTimings() {
    return this.timings;
  }
}

// Global singleton instance
export const profiler = new Profiler();
