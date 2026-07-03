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
    <div
      className="px-3 py-2 text-xs bg-white"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px'
      }}
    >
      <span style={{ flexShrink: 0 }}>Choose fields:</span>
      <SearchBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
    </div>
  );
}
