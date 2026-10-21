import React from 'react';
import { FieldOptionsSearch } from './FieldOptionsSearch';
import FieldsList from './fields-list/FieldsList';
import { FieldOptionsActions } from './FieldOptionsActions';
import DropZonesGrid from './drop-zones/DropZonesGrid';
import { DialogsManager } from '../dialogs/DialogsManager';
import { FilterPillsProvider } from '../filterPills';

import type { FieldItem } from '../../../domain/field/FieldItem';

/**
 * FieldOptionsSection - Field management section of the sidebar
 * Contains search, fields list, actions, drop zones, and dialogs
 */
interface FieldOptionsSectionProps {
  // Parent callbacks
  onFieldsChanged?: (fields: FieldItem[]) => void;
  onManualUpdate?: (previewMode?: boolean) => Promise<string | void>;
  onCreateSnapshot?: (name: string) => void;

  // External state (not in store)
  snapshots?: any[];
  dataEngine?: any;
}

export function FieldOptionsSection(props: FieldOptionsSectionProps) {
  const {
    onManualUpdate,
    onCreateSnapshot,
    snapshots = [],
    dataEngine
  } = props;

  return (
    <div
      className="field-options-section"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      <FieldOptionsSearch />

      <FieldsList />

      <FieldOptionsActions />

      <FilterPillsProvider>
        <DropZonesGrid />

        <DialogsManager
          dataEngine={dataEngine}
          snapshots={snapshots}
          onManualUpdate={onManualUpdate}
          onCreateSnapshot={onCreateSnapshot}
        />
      </FilterPillsProvider>
    </div>
  );
}
