/**
 * Data hash for change detection
 */

/**
 * Generate hash from data (detects changes across the full dataset)
 * Folds every row into a rolling hash instead of sampling first/last rows -
 * two different datasets with the same length, columns, first and last row
 * used to hash identically and silently skip a reload.
 * @param {Array<Object>} data - Data to hash
 * @returns {string} Hash string
 */
export function hashData(data) {
  if (!data || !data.length) return 'empty';

  const cols = Object.keys(data[0]).sort().join(',');

  let hash = 0;
  const fold = (str) => {
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
  };

  fold(`${data.length}_${cols}_`);
  for (const row of data) {
    fold(JSON.stringify(row));
  }

  return hash.toString(36);
}
