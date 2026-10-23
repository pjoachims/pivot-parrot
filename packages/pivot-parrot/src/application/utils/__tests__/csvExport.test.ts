import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildPivotDisplayData } from '../../../domain/pivot/index';
import { buildPivotCSV, buildPivotGrid, buildDataCSV, exportPivotCSV } from '../export';
import { computeLeafColumns } from '../columnHelpers';
import { columnPathKey } from '../cubeIndex';
import { dataToCSV, toCSV } from '../../../domain/query/utils/csv';
import { DuckDBDialect } from '../../../domain/query/dialects/DuckDBDialect';
import { cubeRows as cubeRowsOf, expected, leafMembers } from './salesCube';

const config = {
  values: [
    { field: 'm1', aggregation: 'custom', isCustom: true, name: 'Umsatz €' },
    { field: 'm2', aggregation: 'custom', isCustom: true, name: 'Quote' }
  ],
  customMetrics: [
    { id: 'm1', name: 'Umsatz €', format: { type: 'currency', currency: 'EUR' } },
    { id: 'm2', name: 'Quote', format: { type: 'percentage' } }
  ]
};

const cubeRows = [
  { 'Märkte': 'Köln', m1: 1234.5, m2: 0.1234, '_grouping_Märkte': 0 },
  { 'Märkte': null, m1: 99, m2: 0.5, '_grouping_Märkte': 0 },
  { 'Märkte': null, m1: 1333.5, m2: 0.2, '_grouping_Märkte': 1 }
];

function pivotCSV(locale?: string) {
  const d = buildPivotDisplayData(cubeRows.slice(0, 1).concat(cubeRows[2]), ['Märkte'], ['Σ Values'], config.values);
  return buildPivotCSV(d, d._columnOutline, ['Märkte'], true, true, config, locale);
}

describe('toCSV', () => {
  it('quotes quotes, delimiters, CR and LF (RFC 4180)', () => {
    const row = ['a"b', 'c;d', 'e,f', 'g\nh', 'i\rj', 'plain'];
    expect(toCSV([row], 'de-DE')).toBe('"a""b";"c;d";e,f;"g\nh";"i\rj";plain');
    expect(toCSV([row])).toBe('"a""b",c;d,"e,f","g\nh","i\rj",plain');
  });

  it('writes numbers with the locale decimal and no grouping', () => {
    expect(toCSV([[1234567.5, -0.25, 10n, 400.99999999999994]], 'de-DE')).toBe('1234567,5;-0,25;10;400,99999999999994');
    expect(toCSV([[1234567.5, -0.25, 10n, 400.99999999999994]], 'en-US')).toBe('1234567.5,-0.25,10,400.99999999999994');
  });
});

describe('buildPivotCSV', () => {
  it('writes German Excel conventions for de-DE', () => {
    expect(pivotCSV('de-DE')).toBe('Row Labels;Umsatz €;Quote\nKöln;1234,5;12,34%\nGrand Total;1333,5;20%');
  });

  it('keeps the en default except that percentages carry their percent sign', () => {
    expect(pivotCSV()).toBe('Row Labels,Umsatz €,Quote\nKöln,1234.5,12.34%\nGrand Total,1333.5,20%');
  });

  it('writes percents in subtotal and grand-total columns of a column hierarchy', () => {
    const quote = { values: [config.values[1]], customMetrics: [config.customMetrics[1]] };
    const rows = [
      { Markt: 'Köln', Jahr: 2024, m2: 0.1234, _grouping_Markt: 0, _grouping_Jahr: 0 },
      { Markt: 'Köln', Jahr: null, m2: 0.2, _grouping_Markt: 0, _grouping_Jahr: 1 },
      { Markt: null, Jahr: 2024, m2: 0.3, _grouping_Markt: 1, _grouping_Jahr: 0 },
      { Markt: null, Jahr: null, m2: 0.4, _grouping_Markt: 1, _grouping_Jahr: 1 }
    ];
    const d = buildPivotDisplayData(rows, ['Markt'], ['Jahr', 'Σ Values'], quote.values);
    const csv = buildPivotCSV(d, d._columnOutline, ['Markt'], true, true, quote, 'de-DE');
    expect(csv.split('\n').slice(2)).toEqual(['Köln;12,34%;20%', 'Grand Total;30%;40%']);
  });
});

describe('buildPivotCSV with Σ Values in rows', () => {
  it('writes one row per metric, its percent, and one grand-total row per metric', () => {
    const d = buildPivotDisplayData(cubeRows.slice(0, 1).concat(cubeRows[2]), ['Märkte', 'Σ Values'], [], config.values);
    expect(buildPivotCSV(d, d._columnOutline, ['Märkte', 'Σ Values'], true, true, config, 'de-DE').split('\n')).toEqual([
      'Row Labels;Grand Total',
      'Köln;',
      '    Umsatz €;1234,5',
      '    Quote;12,34%',
      'Grand Total - Umsatz €;1333,5',
      'Grand Total - Quote;20%'
    ]);
  });

  it('heads a column hierarchy with the column members only, no metric level', () => {
    const rows = [
      { Markt: 'Köln', Jahr: 2024, m1: 10, m2: 0.1, _grouping_Markt: 0, _grouping_Jahr: 0 },
      { Markt: 'Köln', Jahr: null, m1: 10, m2: 0.1, _grouping_Markt: 0, _grouping_Jahr: 1 },
      { Markt: null, Jahr: 2024, m1: 10, m2: 0.1, _grouping_Markt: 1, _grouping_Jahr: 0 },
      { Markt: null, Jahr: null, m1: 10, m2: 0.1, _grouping_Markt: 1, _grouping_Jahr: 1 }
    ];
    const d = buildPivotDisplayData(rows, ['Σ Values', 'Markt'], ['Jahr'], config.values);
    expect(buildPivotCSV(d, d._columnOutline, ['Σ Values', 'Markt'], true, true, config, 'de-DE').split('\n')).toEqual([
      'Row Labels;2024;Grand Total',
      'Umsatz €;10;10',
      '    Köln;10;10',
      'Quote;10%;10%',
      '    Köln;10%;10%',
      'Grand Total - Umsatz €;10;10',
      'Grand Total - Quote;10%;10%'
    ]);
  });
});

describe('buildPivotCSV column headers with subtotals', () => {
  // Markt x (Jahr, Monat) with the Jahr subtotal, as the CUBE returns it
  const rows: any[] = [];
  for (const Markt of ['Köln', null]) for (const Jahr of [2024, null]) for (const Monat of [1, 2, null]) {
    if (Jahr === null && Monat !== null) continue;
    rows.push({ Markt, Jahr, Monat, sum_a: 1, sum_b: 2, _grouping_Markt: Markt === null ? 1 : 0, _grouping_Jahr: Jahr === null ? 1 : 0, _grouping_Monat: Monat === null ? 1 : 0 });
  }
  const values = [{ field: 'a', aggregation: 'sum' }, { field: 'b', aggregation: 'sum' }];
  const header = (rowFields: string[], colFields: string[], levels: number, collapsed: string[] = []) => {
    const d = buildPivotDisplayData(rows, rowFields, colFields, values, null, {}, collapsed);
    return buildPivotCSV(d, computeLeafColumns(d), rowFields, true, true, { values }).split('\n').slice(0, levels);
  };

  it('Σ Values in columns: subtotal under its member, metric names on the last level', () => {
    expect(header(['Markt'], ['Jahr', 'Monat', 'Σ Values'], 3)).toEqual([
      'Row Labels,2024,2024,2024,2024,2024,2024,Grand Total,Grand Total',
      ',1,1,2,2,Subtotal,Subtotal,,',
      ',sum_a,sum_b,sum_a,sum_b,sum_a,sum_b,sum_a,sum_b'
    ]);
  });

  it('a collapsed group: its member, then blanks down to the metric names', () => {
    expect(header(['Markt'], ['Jahr', 'Monat', 'Σ Values'], 3, [columnPathKey([2024])])).toEqual([
      'Row Labels,2024,2024,Grand Total,Grand Total',
      ',,,,',
      ',sum_a,sum_b,sum_a,sum_b'
    ]);
  });

  it('Σ Values in rows: subtotal under its member, no metric level', () => {
    expect(header(['Markt', 'Σ Values'], ['Jahr', 'Monat'], 3)).toEqual([
      'Row Labels,2024,2024,2024,Grand Total',
      ',1,2,Subtotal,',
      'Köln,,,,'
    ]);
  });
});

describe('buildDataCSV', () => {
  it('drops _grouping_ columns and labels rolled-up members, leaving genuine NULLs empty', () => {
    expect(buildDataCSV(cubeRows, config, 'de-DE')).toBe('Märkte;Umsatz €;Quote\nKöln;1234,5;12,34%\n;99;50%\nTotal;1333,5;20%');
  });
});

/** An Arrow Decimal128 cell as Arrow JS hands it over: 128-bit two's complement, little endian. */
function decimal128(unscaled: bigint): Uint32Array {
  let v = unscaled < 0n ? unscaled + (1n << 128n) : unscaled;
  const out = new Uint32Array(4);
  for (let i = 0; i < 4; i++) { out[i] = Number(v & 0xffffffffn); v >>= 32n; }
  return out;
}

describe('DECIMAL cells from Arrow', () => {
  const dialect = new DuckDBDialect();
  const dtypes = { Preis: 'decimal<10,2>', m1: 'decimal<38,4>', m2: 'decimal<38,4>' };
  const arrowRows = [
    { Preis: decimal128(1050n), m1: decimal128(12345000n), m2: decimal128(1234n), _grouping_Preis: 0 },
    { Preis: null, m1: decimal128(-500n), m2: decimal128(5000n), _grouping_Preis: 1 }
  ];

  it('buildDataCSV decodes them, with the locale decimal and percents', () => {
    expect(buildDataCSV(arrowRows, config, 'de-DE', dtypes, dialect)).toBe('Preis;Umsatz €;Quote\n10,5;1234,5;12,34%\nTotal;-0,05;50%');
  });

  it('buildPivotCSV decodes the cells', () => {
    const rows = arrowRows.map(r => ({ ...r, Preis: r.Preis && 'teuer' }));
    const d = buildPivotDisplayData(rows, ['Preis'], ['Σ Values'], config.values, null, dtypes);
    expect(buildPivotCSV(d, d._columnOutline, ['Preis'], true, true, config, 'de-DE', dtypes, dialect).split('\n')).toEqual([
      'Row Labels;Umsatz €;Quote',
      'teuer;1234,5;12,34%',
      'Grand Total;-0,05;50%'
    ]);
  });
});

describe('dataToCSV', () => {
  it('stays machine CSV for DuckDB ingestion', () => {
    expect(dataToCSV([{ a: 1.5, b: 'x,y' }, { a: null, b: 'z' }])).toBe('a,b\n1.5,"x,y"\n,z');
  });
});

describe('exportPivotCSV', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prepends a UTF-8 BOM so Excel reads umlauts', async () => {
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob) => { blob = b; return 'blob:x'; }) as any;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const d = buildPivotDisplayData(cubeRows.slice(0, 1), ['Märkte'], ['Σ Values'], config.values);
    exportPivotCSV(d, { ...config, rows: ['Märkte'], grandTotals: 'col' }, 'de-DE');
    const buffer = await new Promise<ArrayBuffer>(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(blob!);
    });
    const bytes = new Uint8Array(buffer);
    expect([...bytes.slice(0, 4)]).toEqual([0xef, 0xbb, 0xbf, 'R'.charCodeAt(0)]);
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)).toBe('\uFEFFRow Labels;Umsatz €;Quote\nKöln;1234,5;12,34%');
  });
});

describe('non-finite numbers in CSV', () => {
  it('are written as empty cells, like null', () => {
    expect(toCSV([[Infinity, -Infinity, NaN, { percent: Infinity }, 1.5]], 'de-DE')).toBe(';;;;1,5');
  });
});

describe('toCSV dates', () => {
  it('writes a date as ISO YYYY-MM-DD and a timestamp as ISO date and time', () => {
    const csv = toCSV([[new Date(Date.UTC(2026, 9, 15)), new Date(Date.UTC(2026, 9, 15, 8, 9, 58))]], 'de-DE');
    expect(csv).toBe('2026-10-15;2026-10-15 08:09:58');
  });
});

describe('buildPivotCSV without column subtotals', () => {
  it('writes in every cell the aggregate of its row and its column', () => {
    const values = [{ field: 'qty', aggregation: 'sum' }, { field: 'price', aggregation: 'sum' }];
    const d = buildPivotDisplayData(cubeRowsOf(['region', 'category', 'product']), ['region'], ['category', 'product', 'Σ Values'], values);
    const leaves = computeLeafColumns(d, true, false);
    const lines = buildPivotCSV(d, leaves, ['region'], true, true, { values }).split('\n').map(line => line.split(','));
    const wrong = [];
    for (const line of lines.filter(l => ['North', 'South', 'Grand Total'].includes(l[0]))) {
      leaves.forEach((leaf, i) => {
        const want = expected(line[0] === 'Grand Total' ? null : line[0], leafMembers(leaf), leaf.metric);
        if (Number(line[i + 1]) !== want) wrong.push(`${line[0]} ${JSON.stringify(leafMembers(leaf))} ${leaf.metric}: writes ${line[i + 1]}, is ${want}`);
      });
    }
    expect(wrong).toEqual([]);
  });
});

describe('buildPivotGrid with a date dimension', () => {
  const dialect = new DuckDBDialect();
  const umsatz = { values: [config.values[0]], customMetrics: [config.customMetrics[0]] };
  const jan = Date.UTC(2024, 0, 1);
  const feb = Date.UTC(2024, 1, 1);
  const rows = [
    { Tag: jan, m1: 10, _grouping_Tag: 0 },
    { Tag: feb, m1: 20, _grouping_Tag: 0 },
    { Tag: null, m1: 30, _grouping_Tag: 1 }
  ];

  it('writes row members as the table shows them, not as epoch milliseconds', () => {
    const dtypes = { Tag: 'date32<DAY>' };
    const d = buildPivotDisplayData(rows, ['Tag'], ['Σ Values'], umsatz.values, null, dtypes);
    const grid = buildPivotGrid(d, computeLeafColumns(d), ['Tag'], true, true, umsatz, dtypes, dialect).cells;
    expect(grid.map(r => r[0])).toEqual(['Row Labels', '2024-01-01', '2024-02-01', 'Grand Total']);
  });

  it('writes a timestamp member with its time', () => {
    const dtypes = { Tag: 'timestamp<MICROSECOND>' };
    const ts = [{ Tag: jan + 3_600_000, m1: 10, _grouping_Tag: 0 }];
    const d = buildPivotDisplayData(ts, ['Tag'], ['Σ Values'], umsatz.values, null, dtypes);
    expect(buildPivotGrid(d, computeLeafColumns(d), ['Tag'], true, false, umsatz, dtypes, dialect).cells[1][0]).toBe('2024-01-01 01:00:00');
  });

  it('writes column members as the table shows them', () => {
    const dtypes = { Tag: 'date32<DAY>' };
    const d = buildPivotDisplayData(rows, [], ['Tag', 'Σ Values'], umsatz.values, null, dtypes);
    const grid = buildPivotGrid(d, computeLeafColumns(d), [], true, true, umsatz, dtypes, dialect).cells;
    expect(grid[0]).toContain('2024-01-01');
    expect(grid[0]).toContain('2024-02-01');
    expect(grid.flat().some(c => c === jan || c === String(jan))).toBe(false);
  });
});
