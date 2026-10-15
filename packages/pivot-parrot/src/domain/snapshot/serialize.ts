import JSZip from 'jszip';
import type { Snapshot } from '../models/types';

/**
 * JSON replacer that converts BigInt to number (safe) or a tagged string (large values).
 * The tag lets bigIntReviver restore precision-losing values back to BigInt on read.
 */
function bigIntReplacer(_key: string, value: any): any {
  if (typeof value === 'bigint') {
    // Convert to number if safe, otherwise tag so it can be restored to BigInt
    if (value <= Number.MAX_SAFE_INTEGER && value >= Number.MIN_SAFE_INTEGER) {
      return Number(value);
    }
    return { __bigint: value.toString() };
  }
  return value;
}

/**
 * JSON reviver that restores values tagged by bigIntReplacer back to BigInt.
 */
function bigIntReviver(_key: string, value: any): any {
  if (value && typeof value === 'object' && typeof value.__bigint === 'string') {
    return BigInt(value.__bigint);
  }
  return value;
}

/**
 * Serialize a single snapshot to a zip blob
 */
export async function serializeSnapshot(snapshot: Snapshot): Promise<Blob> {
  const zip = new JSZip();

  // config.json - pivot config at snapshot time
  zip.file('config.json', JSON.stringify(snapshot.config, null, 2));

  // meta.json - viewState and metadata
  zip.file('meta.json', JSON.stringify({
    id: snapshot.id,
    name: snapshot.name,
    timestamp: snapshot.timestamp,
    dtypes: snapshot.dtypes,
    activeView: snapshot.activeView,
    secondaryDisplayMode: snapshot.secondaryDisplayMode,
    chartConfig: snapshot.chartConfig,
    sortConfig: snapshot.sortConfig,
    sqlQuery: snapshot.sqlQuery,
    splitPosition: snapshot.splitPosition
  }, null, 2));

  // cube.json - cube results
  if (snapshot.cubeResults) {
    zip.file('cube.json', JSON.stringify(snapshot.cubeResults, bigIntReplacer));
  }

  // drilldown.json - drilldown state if present
  if (snapshot.drilldownState) {
    zip.file('drilldown.json', JSON.stringify(snapshot.drilldownState, bigIntReplacer));
  }

  return zip.generateAsync({ type: 'blob' });
}

/**
 * Deserialize a single snapshot from a zip blob
 */
export async function deserializeSnapshot(blob: Blob): Promise<Snapshot> {
  const zip = await JSZip.loadAsync(blob);

  const configStr = await zip.file('config.json')?.async('string');
  const metaStr = await zip.file('meta.json')?.async('string');
  const cubeStr = await zip.file('cube.json')?.async('string');
  const drilldownStr = await zip.file('drilldown.json')?.async('string');

  if (!configStr || !metaStr) {
    throw new Error('Invalid snapshot: missing config.json or meta.json');
  }

  const config = JSON.parse(configStr);
  const meta = JSON.parse(metaStr);
  const cubeResults = cubeStr ? JSON.parse(cubeStr, bigIntReviver) : [];
  const drilldownState = drilldownStr ? JSON.parse(drilldownStr, bigIntReviver) : undefined;

  return {
    id: meta.id,
    name: meta.name,
    timestamp: meta.timestamp,
    config,
    cubeResults,
    dtypes: meta.dtypes,
    activeView: meta.activeView,
    secondaryDisplayMode: meta.secondaryDisplayMode,
    chartConfig: meta.chartConfig,
    sortConfig: meta.sortConfig,
    sqlQuery: meta.sqlQuery,
    splitPosition: meta.splitPosition,
    drilldownState
  };
}
