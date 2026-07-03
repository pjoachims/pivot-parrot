/**
 * Custom Expression Icons
 * Reusable icons for custom metrics, groupings, and filters
 */

import React from 'react';

export type CustomExpressionType = 'metric' | 'grouping' | 'filter';

export const CustomExpressionColors = {
  metric: '#3b82f6',   // blue-500
  grouping: '#dc2626', // red-600
  filter: '#16a34a',   // green-600
} as const;

export const CustomExpressionSymbols = {
  metric: '∑',
  grouping: '⊗',
  filter: '⊘',
} as const;

export const CustomExpressionHoverBg = {
  metric: 'bg-blue-50',
  grouping: 'bg-red-50',
  filter: 'bg-green-50',
} as const;

interface CustomExpressionIconProps {
  type: CustomExpressionType;
  size?: number;
}

/**
 * CustomExpressionIcon - Renders the icon for a custom expression type
 */
export function CustomExpressionIcon({ type, size = 14 }: CustomExpressionIconProps) {
  const color = CustomExpressionColors[type];
  const symbol = CustomExpressionSymbols[type];

  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <text x="8" y="12" textAnchor="middle" fontSize="11" fontWeight="700" fill={color}>
        {symbol}
      </text>
    </svg>
  );
}
