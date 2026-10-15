import { getArrowType } from '../../domain/types/ArrowTypes';
import { convertForGrid } from '../../application/utils/columnarResult';
import { decodeNumber } from '../../application/utils/formatters';
import type { SQLDialect } from '../../domain/query/dialects/SQLDialect';

/** The significant decimal digits a binary float holds; a double holds 15. */
const FLOAT_DIGITS: Record<string, number> = { float16: 3, float32: 7 };

/**
 * A raw value at the precision it has, not as a metric is formatted: integers
 * whole, DECIMAL to its scale, floats to the significant digits their type holds.
 */
function rawNumberFormat(typeName: string, category: string | undefined, locale: string): Intl.NumberFormat {
  // A DECIMAL whose type name lost its scale falls back to the float rule.
  const scale = /^decimal\d*<\s*\d+\s*,\s*(\d+)\s*>$/.exec(typeName)?.[1];
  const digits = scale !== undefined
    ? { minimumFractionDigits: Math.min(Number(scale), 20), maximumFractionDigits: Math.min(Number(scale), 20) }
    : category === 'float' ? { maximumSignificantDigits: FLOAT_DIGITS[typeName] ?? 15 } : { maximumFractionDigits: 0 };
  return new Intl.NumberFormat(locale, { useGrouping: false, ...digits });
}

/**
 * An ag-grid column over a raw result column (drilldown, SQL playground): the
 * value read lazily per row, the filter and the display by the engine type.
 */
export function gridColumnDef(key: string, headerName: string, typeName: string, locale: string, dialect: SQLDialect | null, getValue: (row: number) => any) {
  const arrowType = getArrowType(typeName);

  const colDef: any = {
    field: key,
    headerName,
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 100,
    valueGetter: (params) => convertForGrid(decodeNumber(getValue(params.data.__row), typeName, dialect), arrowType)
  };

  if (arrowType?.category === 'temporal') {
    colDef.filter = 'agDateColumnFilter';
    colDef.valueFormatter = (params) => {
      if (!params.value) return '';
      if (params.value instanceof Date) {
        return arrowType.name === 'timestamp'
          ? params.value.toLocaleString(locale)
          : params.value.toLocaleDateString(locale);
      }
      return params.value;
    };
  } else if (arrowType?.isNumeric) {
    colDef.filter = 'agNumberColumnFilter';
    const nf = rawNumberFormat(typeName, arrowType.category, locale);
    // An int64 beyond the safe range arrives as a string and stays exact.
    colDef.valueFormatter = (params) => {
      if (typeof params.value !== 'number') return params.value == null ? '' : String(params.value);
      return Number.isFinite(params.value) ? nf.format(params.value) : '';
    };
  } else if (arrowType?.category === 'boolean') {
    colDef.filter = 'agSetColumnFilter';
  } else {
    colDef.filter = 'agTextColumnFilter';
  }

  return colDef;
}
