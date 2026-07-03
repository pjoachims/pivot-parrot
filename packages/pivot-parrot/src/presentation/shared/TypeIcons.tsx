/**
 * Type icon components
 * Centralized icon definitions for data types
 */

import React from 'react';

const color = 'var(--text-muted)';

export const TypeIcons = {
  integer: (size: number) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <text x="8" y="12" textAnchor="middle" fontSize="10" fontWeight="700" fill={color}>
        #
      </text>
    </svg>
  ),

  float: (size: number) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <text x="8" y="12" textAnchor="middle" fontSize="9" fontWeight="600" fill={color}>
        1.2
      </text>
    </svg>
  ),

  string: (size: number) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <text x="8" y="12" textAnchor="middle" fontSize="9" fontWeight="600" fill={color}>
        Abc
      </text>
    </svg>
  ),

  calendar: (size: number) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5">
      <rect x="3" y="4" width="10" height="9" rx="1" />
      <line x1="3" y1="7" x2="13" y2="7" />
      <line x1="6" y1="2" x2="6" y2="5" strokeLinecap="round" />
      <line x1="10" y1="2" x2="10" y2="5" strokeLinecap="round" />
    </svg>
  ),

  clock: (size: number) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5">
      <circle cx="8" cy="8" r="5" />
      <line x1="8" y1="6" x2="8" y2="8" strokeLinecap="round" />
      <line x1="8" y1="8" x2="10" y2="9" strokeLinecap="round" />
    </svg>
  ),

  toggle: (size: number) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="3" y="5" width="10" height="6" rx="3" fill={color} opacity="0.2" />
      <circle cx="9" cy="8" r="2.5" fill={color} />
    </svg>
  ),

  struct: (size: number) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <text x="8" y="12" textAnchor="middle" fontSize="9" fontWeight="600" fill={color}>
        {'{}'}
      </text>
    </svg>
  ),

  array: (size: number) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <text x="8" y="12" textAnchor="middle" fontSize="9" fontWeight="600" fill={color}>
        []
      </text>
    </svg>
  ),

  map: (size: number) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <text x="8" y="12" textAnchor="middle" fontSize="9" fontWeight="600" fill={color}>
        {'{:}'}
      </text>
    </svg>
  ),
};

// IconKey type is defined in domain/types/ArrowTypes.ts
