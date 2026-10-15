import React from 'react';
import { TYPE_ICON } from '../../shared/TypeIcons';
import { Icon } from '../../shared/Icon';
import { getArrowType } from '../../../domain/types/ArrowTypes';
import type { ArrowType, IconKey } from '../../../domain/types/ArrowTypes';

function iconKey(type: ArrowType | IconKey | string | number | undefined): IconKey {
  if (typeof type === 'object' && type?.icon) return type.icon as IconKey;
  if (typeof type === 'string') return getArrowType(type)?.icon ?? 'string';
  return 'string';
}

export default function TypeIcon({ type }: { type: ArrowType | IconKey | string | number | undefined }) {
  return <Icon name={TYPE_ICON[iconKey(type)]} />;
}
