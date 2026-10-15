import { it, expect } from 'vitest';
import { buildColumnOutline } from '../columnBuilder';

const sum = [{ field: 'x', aggregation: 'sum' }];

function memberOrder(members: unknown[], withGrandTotal: boolean) {
  const rows: any[] = members.map((m, i) => ({ month: m, sum_x: i, _grouping_month: 0 }));
  if (withGrandTotal) rows.push({ month: null, sum_x: 99, _grouping_month: 1 });
  return buildColumnOutline(rows, ['month'], sum, -1, false, {})
    .map(c => c.path[0] ?? 'total');
}

it('orders numeric column members by value, not as text', () => {
  expect(memberOrder([12, 1, 10, 2, 11, 9, 3], true)).toEqual([1, 2, 3, 9, 10, 11, 12, 'total']);
});

it('orders bigint members by value (DuckDB integers) also without a grand total', () => {
  expect(memberOrder([10n, 9n, 1n], false)).toEqual([1n, 9n, 10n]);
});

it('orders dates chronologically', () => {
  const d = (s: string) => new Date(s);
  const order = memberOrder([d('2024-03-01'), d('2024-01-01'), d('2023-06-01')], true);
  expect(order.slice(0, 3).map((x: any) => x.toISOString().slice(0, 10))).toEqual(['2023-06-01', '2024-01-01', '2024-03-01']);
});

it('still orders text members alphabetically', () => {
  expect(memberOrder(['West', 'East', 'North'], true)).toEqual(['East', 'North', 'West', 'total']);
});
