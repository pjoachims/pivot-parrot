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
    <div className="px-3 py-2 text-xs" style={{ display: 'flex' }}>
      <SearchBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
    </div>
  );
}
