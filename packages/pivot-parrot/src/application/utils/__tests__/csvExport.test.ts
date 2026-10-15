import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildPivotDisplayData } from '../../../domain/pivot/index';
import { buildPivotCSV, buildDataCSV, exportPivotCSV } from '../export';
import { dataToCSV, toCSV } from '../../../domain/query/utils/csv';

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

describe('buildDataCSV', () => {
  it('drops _grouping_ columns and labels rolled-up members, leaving genuine NULLs empty', () => {
    expect(buildDataCSV(cubeRows, config, 'de-DE')).toBe('Märkte;Umsatz €;Quote\nKöln;1234,5;12,34%\n;99;50%\nTotal;1333,5;20%');
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
    exportPivotCSV(d, d._columnOutline, ['Märkte'], true, false, config, 'de-DE');
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
