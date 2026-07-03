import React from 'react';

/**
 * SearchBar component for FieldOptions
 * Provides search functionality for filtering fields
 */
export default function SearchBar({ searchQuery, onSearchChange }) {
  return (
    <div style={{ width: '180px', position: 'relative' }}>
      <svg
        className="text-gray-600 pointer-events-none"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', zIndex: 1 }}
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        placeholder="Search"
        aria-label="Search fields"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full py-1 text-sm"
        style={{
          background: 'var(--surface-hover)',
          border: 'none',
          borderRadius: '4px',
          paddingLeft: '8px',
          paddingRight: '40px'
        }}
      />
    </div>
  );
}
