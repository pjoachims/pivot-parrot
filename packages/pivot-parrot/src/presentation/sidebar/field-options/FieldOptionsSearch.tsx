import React from 'react';
import { usePivotStore } from '../../../application/state/store';
import SearchBar from '../shared/SearchBar';

/**
 * Search component for FieldOptions
 * Filters available fields and custom metrics
 */
export function FieldOptionsSearch() {
  const searchQuery = usePivotStore(s => s.searchQuery);
  const setSearchQuery = usePivotStore(s => s.setSearchQuery);

  return (
    <div style={{ display: 'flex', padding: 'var(--space-2) var(--space-3)' }}>
      <SearchBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
    </div>
  );
}
