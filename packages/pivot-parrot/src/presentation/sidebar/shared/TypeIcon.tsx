import React from 'react';
import { TypeIcons } from '../../shared/TypeIcons';
import { getArrowType } from '../../../domain/types/ArrowTypes';
import type { ArrowType, IconKey } from '../../../domain/types/ArrowTypes';

export default function TypeIcon({ type, size = 14 }: { type: ArrowType | IconKey | any, size?: number }) {
  // If it's an Arrow type object with icon property
  if (typeof type === 'object' && type?.icon) {
    const iconKey = type.icon as IconKey;
    return TypeIcons[iconKey]?.(size) ?? TypeIcons.string(size);
  }

  // If it's a string, try to find Arrow type
  if (typeof type === 'string') {
    const arrowType = getArrowType(type);
    if (arrowType) {
      return TypeIcons[arrowType.icon](size);
    }
    // Fallback to string icon
    return TypeIcons.string(size);
  }

  // Default fallback
  return TypeIcons.string(size);
}
