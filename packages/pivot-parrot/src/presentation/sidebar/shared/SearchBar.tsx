import React from 'react';
import { Icon } from '../../shared/Icon';

/**
 * SearchBar component for FieldOptions
 * Provides search functionality for filtering fields
 */
export default function SearchBar({ searchQuery, onSearchChange }) {
  return (
    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
      <Icon
        name="search"
        style={{ position: 'absolute', left: 'var(--space-2)', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
      />
      <input
        type="search"
        placeholder="Search fields"
        aria-label="Search fields"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="pp-input pp-input--sm"
        style={{ paddingLeft: '28px' }}
      />
    </div>
  );
}
