import React from 'react';
import '../styles.css';
import { usePivotStore } from '../../../application/state/store';
import { Sidebar } from '../Sidebar';
import { SidebarTopBar } from '../top-bar/SidebarTopBar';
import { FieldOptionsSection } from './FieldOptionsSection';
import { SnapshotsPanel } from '../snapshots/SnapshotsPanel';

import type { FieldItem } from '../../../domain/field/FieldItem';

/**
 * FieldOptions Container - Layout orchestrator
 * Only passes external data/callbacks. All components read from store.
 */
interface FieldOptionsContainerProps {
  // Parent callbacks
  onFieldsChanged?: (fields: FieldItem[]) => void;
  onManualUpdate?: (previewMode?: boolean) => Promise<string | void>;
  onAutoUpdateChange?: (value: boolean) => void;
  onToggleCollapse?: () => void;
  onCreateSnapshot?: (name: string) => void;
  onLoadSnapshot?: (snapshotId: string) => void;
  onDeleteSnapshot?: (snapshotId: string) => void;
  onDownloadAllSnapshots?: () => void;
  onSnapshotsImported?: (snapshots: any[]) => void;
  onExport?: (type: string, data: any) => void;

  // External state (not in store)
  isRemoteConnection?: boolean;
  snapshots?: any[];
  sqlHistory?: any[];
  dataEngine?: any;
}

export default function FieldOptionsContainer(props: FieldOptionsContainerProps) {
  const {
    onFieldsChanged,
    onManualUpdate,
    onAutoUpdateChange,
    onToggleCollapse,
    onCreateSnapshot,
    onLoadSnapshot,
    onDeleteSnapshot,
    onDownloadAllSnapshots,
    onSnapshotsImported,
    onExport,
    isRemoteConnection = false,
    snapshots = [],
    sqlHistory = [],
    dataEngine
  } = props;

  // Read UI state from store
  const sidebarCollapsed = usePivotStore(s => s.sidebarCollapsed);
  const handleDrop = usePivotStore(s => s.handleDrop);

  // Handle drop outside zones
  const handleOutsideDrop = (e: React.DragEvent) => {
    const x = e.clientX;
    const y = e.clientY;

    const zones = e.currentTarget.querySelectorAll('.drop-zone');
    let isInZone = false;

    zones.forEach(zone => {
      const zoneRect = zone.getBoundingClientRect();
      if (x >= zoneRect.left && x <= zoneRect.right && y >= zoneRect.top && y <= zoneRect.bottom) {
        isInZone = true;
      }
    });

    if (!isInZone) {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      handleDrop(data.fieldName, data.sourceZone, null);
    }
  };

  // Main layout with new Sidebar structure
  return (
    <Sidebar
      isCollapsed={sidebarCollapsed}
      onToggleCollapse={onToggleCollapse}
      onDrop={handleOutsideDrop}
    >
      <SidebarTopBar
        isRemoteConnection={isRemoteConnection}
        sqlHistory={sqlHistory}
        snapshots={snapshots}
        onSnapshotsImported={onSnapshotsImported}
        onAutoUpdateChange={onAutoUpdateChange}
        onManualUpdate={onManualUpdate}
        onToggleCollapse={onToggleCollapse}
        onFieldsChanged={onFieldsChanged}
      />

      <FieldOptionsSection
        onFieldsChanged={onFieldsChanged}
        onManualUpdate={onManualUpdate}
        onCreateSnapshot={onCreateSnapshot}
        snapshots={snapshots}
        dataEngine={dataEngine}
      />

      <SnapshotsPanel
        snapshots={snapshots}
        onCreateSnapshot={onCreateSnapshot}
        onLoadSnapshot={onLoadSnapshot}
        onDeleteSnapshot={onDeleteSnapshot}
        onDownloadAllSnapshots={onDownloadAllSnapshots}
      />
    </Sidebar>
  );
}
