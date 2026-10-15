import React from 'react';
import { Icon, type IconName } from '../../shared/Icon';

export type CustomExpressionType = 'metric' | 'grouping' | 'filter';

/** One glyph per custom expression kind; the kind is told by shape, not color. */
const ICONS: Record<CustomExpressionType, IconName> = {
  metric: 'sigma',
  grouping: 'layers',
  filter: 'filter'
};

export function CustomExpressionIcon({ type }: { type: CustomExpressionType }) {
  return <Icon name={ICONS[type]} />;
}
