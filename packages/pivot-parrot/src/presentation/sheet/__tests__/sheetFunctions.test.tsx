import React from 'react';
import { it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import SheetView from '../SheetView';
import { gridOf } from '../../../domain/sheet/__tests__/gridOf';
import { SHEET_FUNCTIONS } from '../../../domain/sheet/functions';

const sales = [
  ['Region', 'Sales'],
  ['North', 120],
  ['South', 80],
  ['East', 50],
  ['Grand Total', 250]
];

/** Per listed function: its arguments and the result they give with the sales above. */
const EXAMPLES: Record<string, [string, string]> = {
  SUM: ['(B2:B4)', '250'],
  AVERAGE: ['(B2:B4)', '83.3333'],
  MIN: ['(B2:B4)', '50'],
  MAX: ['(B2:B4)', '120'],
  COUNT: ['(A2:B4)', '3'],
  COUNTA: ['(A2:A4)', '3'],
  COUNTBLANK: ['(H2:H4)', '3'],
  MEDIAN: ['(B2:B4)', '80'],
  'STDEV.S': ['(B3:B4)', '21.2132'],
  'STDEV.P': ['(B3:B4)', '15'],
  'VAR.S': ['(B3:B4)', '450'],
  'VAR.P': ['(B3:B4)', '225'],
  PRODUCT: ['(B4,2)', '100'],
  POWER: ['(2,3)', '8'],
  SQRT: ['(B2+1)', '11'],
  ABS: ['(-B2)', '120'],
  ROUND: ['(B2/7,1)', '17.1'],
  ROUNDUP: ['(B2/7,1)', '17.2'],
  ROUNDDOWN: ['(B2/7,1)', '17.1'],
  CEILING: ['(B2/7,1)', '18'],
  FLOOR: ['(B2/7,1)', '17'],
  INT: ['(B2/7)', '17'],
  TRUNC: ['(B2/7,1)', '17.1'],
  MOD: ['(B2,7)', '1'],
  IF: ['(B2>100,1,0)', '1'],
  IFS: ['(B2>200,1,B2>100,2)', '2'],
  IFERROR: ['(B2/0,7)', '7'],
  AND: ['(B2>1,B3>100)', 'false'],
  OR: ['(B2>1,B3>100)', 'true'],
  NOT: ['(B2>1)', 'false'],
  CONCATENATE: ['(A2,"-",A3)', 'North-South'],
  LEFT: ['(A2,2)', 'No'],
  RIGHT: ['(A2,2)', 'th'],
  LEN: ['(A2)', '5'],
  UPPER: ['(A2)', 'NORTH'],
  LOWER: ['(A2)', 'north'],
  TRIM: ['("  a  b ")', 'a b']
};

it('every listed function computes, by its English and its German name', () => {
  expect(Object.keys(EXAMPLES)).toEqual(SHEET_FUNCTIONS.map(f => f.name));
  const view = render(<SheetView grid={gridOf(sales)} cells={{}} onCellsChange={() => {}} />);
  const ws = (view.container.querySelector('.jss_container') as any).jssWorksheet;
  SHEET_FUNCTIONS.forEach((f, y) => {
    const [args] = EXAMPLES[f.name];
    act(() => ws.setValueFromCoords(3, y, `=${f.name}${args}`));
    act(() => ws.setValueFromCoords(4, y, `=${f.de ?? f.name}${args.replace(/,/g, ';')}`));
  });
  const results = SHEET_FUNCTIONS.map((f, y) => [f.name, ws.getValueFromCoords(3, y, true), ws.getValueFromCoords(4, y, true)]);
  expect(results).toEqual(SHEET_FUNCTIONS.map(f => [f.name, EXAMPLES[f.name][1], EXAMPLES[f.name][1]]));
});

it('AVG computes as AVERAGE, and the cell keeps the name as typed', () => {
  const view = render(<SheetView grid={gridOf(sales)} cells={{}} onCellsChange={() => {}} />);
  const ws = (view.container.querySelector('.jss_container') as any).jssWorksheet;
  act(() => ws.setValueFromCoords(3, 1, '=avg(b2:b3)'));
  expect(ws.getValueFromCoords(3, 1, true)).toBe('100');
  expect(ws.getValueFromCoords(3, 1)).toBe('=AVG(B2:B3)');
});
