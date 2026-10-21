import { it, expect } from 'vitest';
import { createPivotStore } from '../store';
import { columnPathKey } from '../../utils/cubeIndex';

it('persists a sort on a BigInt column member and reads it back as the same column', async () => {
  const key = `sort-persist-${Math.random()}`;
  const store = createPivotStore(key);
  expect(() => store.getState().setSort({ valueKey: 'sum_sales', direction: 'asc', columnPath: [2024n, null] })).not.toThrow();

  const reloaded = createPivotStore(key);
  await reloaded.persist.rehydrate();
  const { columnPath, ...rest } = reloaded.getState().sortConfig;
  expect(rest).toEqual({ valueKey: 'sum_sales', direction: 'asc' });
  expect(columnPathKey(columnPath!)).toBe(columnPathKey([2024n, null]));
});
