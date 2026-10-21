import { describe, it, expect } from 'vitest';
import { fitColumns, expandGroup, type ColumnFolds } from '../columnFit';
import { columnGroups } from '../columnBuilder';
import { countDisplayColumns } from '../index';
import { columnPathKey } from '../../../application/utils/cubeIndex';
import { cube, type Fact } from './cubeFixture';

// 2 categories × 5 regions × 8 segments. Every column shown: 2 × (5 × (8 + 1) + 1) + 1 = 93.
// Regions folded: 2 × (5 + 1) + 1 = 13. Categories folded: 2 + 1 = 3.
const facts: Fact[] = [];
for (const category of ['A', 'B']) {
  for (let r = 0; r < 5; r++) {
    for (let s = 0; s < 8; s++) facts.push({ category, region: `r${r}`, segment: `s${s}`, sales: 1 });
  }
}
const columns = ['category', 'region', 'segment'];
const sqlRows = cube(facts, columns);
const groups = columnGroups(sqlRows, columns);
const sales = [{ field: 'sales', aggregation: 'sum' }];
const count = (collapsed: Set<string>) =>
  countDisplayColumns(sqlRows, [], columns, sales, collapsed, { showColSubtotals: true, showGrandTotalCol: true });

const key = (...path: string[]) => columnPathKey(path);
const regionsOf = (category: string) => [0, 1, 2, 3, 4].map(r => key(category, `r${r}`));
const none: ColumnFolds = { collapsed: [], expanded: [] };

describe('fitColumns', () => {
  it('folds nothing when every column fits', () => {
    expect(fitColumns(groups, none, 93, count)).toEqual({ collapsed: [], autoCollapsed: [], columnCount: 93 });
  });

  it('folds the deepest group level when that is enough', () => {
    const fit = fitColumns(groups, none, 50, count);
    expect(fit).toEqual({ collapsed: expect.any(Array), autoCollapsed: expect.any(Array), columnCount: 13 });
    if ('error' in fit) return;
    expect(new Set(fit.autoCollapsed)).toEqual(new Set([...regionsOf('A'), ...regionsOf('B')]));
    expect(new Set(fit.collapsed)).toEqual(new Set(fit.autoCollapsed));
  });

  it('folds a level further up only when the deepest is not enough', () => {
    const fit = fitColumns(groups, none, 10, count);
    expect(fit).toEqual({ collapsed: [key('A'), key('B')], autoCollapsed: [key('A'), key('B')], columnCount: 3 });
  });

  it('keeps the groups the user collapsed and does not count them as folded to fit', () => {
    const fit = fitColumns(groups, { collapsed: [key('A')], expanded: [] }, 20, count);
    if ('error' in fit) throw new Error('expected a fit');
    expect(fit.columnCount).toBe(8);
    expect(new Set(fit.collapsed)).toEqual(new Set([key('A'), ...regionsOf('B')]));
    expect(new Set(fit.autoCollapsed)).toEqual(new Set(regionsOf('B')));
  });

  it('leaves the groups the user opened open', () => {
    const fit = fitColumns(groups, { collapsed: [], expanded: [key('A', 'r0')] }, 50, count);
    if ('error' in fit) throw new Error('expected a fit');
    expect(fit.columnCount).toBe(13 + 8);
    expect(fit.collapsed).not.toContain(key('A', 'r0'));
  });

  it('folds the groups the user opened when the table cannot fit with them open', () => {
    const fit = fitColumns(groups, { collapsed: [], expanded: [key('A', 'r0')] }, 12, count);
    expect(fit).toEqual({ collapsed: [key('A'), key('B')], autoCollapsed: [key('A'), key('B')], columnCount: 3 });
  });

  it('reports the narrowest table when even every group folded is too wide', () => {
    expect(fitColumns(groups, none, 2, count)).toEqual({ error: true, columnCount: 3 });
  });

  it('reports a too-wide table without groups to fold', () => {
    const flat = cube(facts, ['segment']);
    const flatCount = (collapsed: Set<string>) =>
      countDisplayColumns(flat, [], ['segment'], sales, collapsed, { showColSubtotals: true, showGrandTotalCol: true });
    expect(fitColumns(columnGroups(flat, ['segment']), none, 5, flatCount)).toEqual({ error: true, columnCount: 9 });
  });
});

describe('expandGroup', () => {
  it('opens a folded group while the table still fits, and refuses once it would not', () => {
    let folds = none;
    for (let r = 0; r < 4; r++) {
      const next = expandGroup(groups, folds, ['A', `r${r}`], 50, count);
      expect(next, `r${r}`).toEqual({ collapsed: [], expanded: [...folds.expanded, key('A', `r${r}`)] });
      folds = next!;
    }
    // 13 + 5 × 8 = 53 columns
    expect(expandGroup(groups, folds, ['A', 'r4'], 50, count)).toBeNull();
  });

  it('refuses to open a group when that would fold a group that is open now', () => {
    // A collapsed: 1 + 46 + 1 = 48 columns. A open: 93, so B's regions would fold.
    expect(expandGroup(groups, { collapsed: [key('A')], expanded: [] }, ['A'], 50, count)).toBeNull();
  });

  it('opens a group whose own members fold to fit', () => {
    // B's regions are folded already; opening A shows A with its regions folded.
    const next = expandGroup(groups, { collapsed: [key('A')], expanded: [] }, ['A'], 20, count);
    expect(next).toEqual({ collapsed: [], expanded: [key('A')] });
    const fit = fitColumns(groups, next!, 20, count);
    if ('error' in fit) throw new Error('expected a fit');
    expect(new Set(fit.autoCollapsed)).toEqual(new Set([...regionsOf('A'), ...regionsOf('B')]));
  });
});

it('fits a table with more groups than a function call takes arguments', () => {
  const many = Array.from({ length: 200_000 }, (_, i) => [`m${i}`]);
  expect(fitColumns(many, none, 10, collapsed => (collapsed.size === many.length ? 1 : 1_000_000))).toEqual({
    collapsed: expect.any(Array), autoCollapsed: expect.any(Array), columnCount: 1
  });
});
