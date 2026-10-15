import JSZip from 'jszip';
import type { SavedView } from '../models/types';
import { bigIntReplacer, bigIntReviver } from './json';

export async function serializeSnapshot(saved: SavedView): Promise<Blob> {
  const zip = new JSZip();
  zip.file('view.json', JSON.stringify(saved, bigIntReplacer, 2));
  return zip.generateAsync({ type: 'blob' });
}

/** Reads a saved view, or a snapshot from before views (its result data is dropped). */
export async function deserializeSnapshot(blob: Blob): Promise<SavedView> {
  const zip = await JSZip.loadAsync(blob);

  const viewStr = await zip.file('view.json')?.async('string');
  if (viewStr) {
    return JSON.parse(viewStr, bigIntReviver);
  }

  const configStr = await zip.file('config.json')?.async('string');
  const metaStr = await zip.file('meta.json')?.async('string');
  const drilldownStr = await zip.file('drilldown.json')?.async('string');
  if (!configStr || !metaStr) {
    throw new Error('Invalid snapshot: missing view.json');
  }
  const meta = JSON.parse(metaStr);
  const drilldown = drilldownStr ? JSON.parse(drilldownStr, bigIntReviver) : null;

  return {
    id: meta.id,
    name: meta.name ?? meta.id,
    createdAt: new Date(meta.timestamp).toISOString(),
    view: {
      v: 1,
      config: JSON.parse(configStr),
      derivedFields: [],
      sortConfig: meta.sortConfig ?? { valueKey: null, direction: 'desc' },
      activeView: meta.activeView ?? null,
      secondaryDisplayMode: meta.secondaryDisplayMode ?? 'hidden',
      chartConfig: meta.chartConfig ?? null,
      splitPosition: meta.splitPosition ?? 50,
      drilldownFilters: drilldown?.filters ?? null
    }
  };
}
