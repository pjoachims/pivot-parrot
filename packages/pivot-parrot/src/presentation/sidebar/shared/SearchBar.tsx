import React from 'react';

/**
 * SearchBar component for FieldOptions
 * Provides search functionality for filtering fields
 */
export default function SearchBar({ searchQuery, onSearchChange }) {
  return (
    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
      <svg
        className="pointer-events-none"
        width="13"
        height="13"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        style={{
          position: 'absolute',
          left: '8px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text-muted)'
        }}
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="search"
        placeholder="Search fields"
        aria-label="Search fields"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          height: '26px',
          padding: '0 8px 0 26px',
          fontSize: 'inherit',
          color: 'var(--text-primary)',
          background: 'var(--surface-bg)',
          border: '1px solid var(--border-color-medium)',
          borderRadius: '4px',
          outline: 'none'
        }}
      />
    </div>
  );
}
