import type { IconKey } from '../../domain/types/ArrowTypes';
import type { IconName } from './Icon';

/**
 * The glyph for each data-type family, drawn from the one icon set so a
 * type badge has the same 14px stroke as every other icon in a row. Integer
 * and float share the hash: the row's tooltip names the exact dtype.
 */
export const TYPE_ICON: Record<IconKey, IconName> = {
  integer: 'hash',
  float: 'hash',
  string: 'type',
  calendar: 'calendar',
  clock: 'clock',
  toggle: 'toggle',
  struct: 'braces',
  array: 'brackets',
  map: 'braces'
};
