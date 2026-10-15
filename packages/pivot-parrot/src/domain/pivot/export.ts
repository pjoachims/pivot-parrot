import JSZip from 'jszip';
import type { SavedView, PivotTableConfig } from '../models/types';
import type { FieldItem } from '../field/FieldItem';
import { serializeSnapshot, deserializeSnapshot } from '../snapshot/serialize';

/**
 * Full pivot export structure
 */
export interface PivotExport {
  version: '1';
  timestamp: string;
  config: PivotTableConfig;
  derivedFields: FieldItem[];
}

/**
 * Export full pivot state to a zip blob
 */
export async function exportPivot(
  config: PivotTableConfig,
  derivedFields: FieldItem[],
  snapshots: SavedView[]
): Promise<Blob> {
  const zip = new JSZip();

  // manifest.json - current config and derived fields
  const manifest: PivotExport = {
    version: '1',
    timestamp: new Date().toISOString(),
    config,
    derivedFields
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // snapshots/ - each snapshot as its own zip
  const snapshotsFolder = zip.folder('snapshots');
  for (const snapshot of snapshots) {
    const snapshotBlob = await serializeSnapshot(snapshot);
    const snapshotBuffer = await snapshotBlob.arrayBuffer();
    snapshotsFolder?.file(`${snapshot.id}.zip`, snapshotBuffer);
  }

  return zip.generateAsync({ type: 'blob' });
}

/**
 * Import full pivot state from a zip blob
 */
export async function importPivot(blob: Blob): Promise<{
  config: PivotTableConfig;
  derivedFields: FieldItem[];
  snapshots: SavedView[];
}> {
  const zip = await JSZip.loadAsync(blob);

  // Read manifest
  const manifestStr = await zip.file('manifest.json')?.async('string');
  if (!manifestStr) {
    throw new Error('Invalid pivot export: missing manifest.json');
  }
  const manifest: PivotExport = JSON.parse(manifestStr);

  // Read snapshots
  const snapshots: SavedView[] = [];
  const snapshotsFolder = zip.folder('snapshots');
  if (snapshotsFolder) {
    const snapshotFiles = snapshotsFolder.filter((_, file) => file.name.endsWith('.zip'));
    for (const file of snapshotFiles) {
      const snapshotBuffer = await file.async('arraybuffer');
      const snapshotBlob = new Blob([snapshotBuffer]);
      const snapshot = await deserializeSnapshot(snapshotBlob);
      snapshots.push(snapshot);
    }
  }

  return {
    config: manifest.config,
    derivedFields: manifest.derivedFields,
    snapshots
  };
}
