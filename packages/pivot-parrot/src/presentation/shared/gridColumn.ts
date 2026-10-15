import { getArrowType } from '../../domain/types/ArrowTypes';
import { convertForGrid } from '../../application/utils/columnarResult';
import { decodeNumber, defaultFormat, formatNumber } from '../../application/utils/formatters';
import type { SQLDialect } from '../../domain/query/dialects/SQLDialect';

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
    const format = defaultFormat(arrowType.category);
    // An int64 beyond the safe range arrives as a string and stays exact.
    colDef.valueFormatter = (params) => params.value == null ? '' : typeof params.value === 'number' ? formatNumber(params.value, format, locale) : String(params.value);
  } else if (arrowType?.category === 'boolean') {
    colDef.filter = 'agSetColumnFilter';
  } else {
    colDef.filter = 'agTextColumnFilter';
  }

  return colDef;
}
