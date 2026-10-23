/** A small sales fact table, its CUBE rows as the pivot query returns them, and the aggregate of any cell. */

export const facts = [
  { region: 'North', category: 'Drinks', product: 'Beer', qty: 1, price: 10 },
  { region: 'North', category: 'Drinks', product: 'Wine', qty: 2, price: 20 },
  { region: 'North', category: 'Food', product: 'Bread', qty: 3, price: 30 },
  { region: 'North', category: 'Food', product: 'Cheese', qty: 4, price: 40 },
  { region: 'South', category: 'Drinks', product: 'Beer', qty: 5, price: 50 },
  { region: 'South', category: 'Drinks', product: 'Wine', qty: 6, price: 60 },
  { region: 'South', category: 'Food', product: 'Bread', qty: 7, price: 70 },
  { region: 'South', category: 'Food', product: 'Cheese', qty: 8, price: 80 }
];

const COLUMN_FIELDS = ['category', 'product'];

/** Every grouping set of `dims` with sum_qty and sum_price. */
export function cubeRows(dims: string[]) {
  const out = [];
  for (let mask = 0; mask < 1 << dims.length; mask++) {
    const groups = new Map();
    for (const f of facts) {
      const key = dims.map((d, i) => (mask >> i) & 1 ? null : f[d]);
      const k = JSON.stringify(key);
      const g = groups.get(k) ?? { key, qty: 0, price: 0 };
      g.qty += f.qty;
      g.price += f.price;
      groups.set(k, g);
    }
    for (const g of groups.values()) {
      const row: Record<string, unknown> = { sum_qty: g.qty, sum_price: g.price };
      dims.forEach((d, i) => { row[d] = g.key[i]; row[`_grouping_${d}`] = (mask >> i) & 1; });
      out.push(row);
    }
  }
  return out;
}

/** The sum of `metric` over the facts of `region` (null: every region) under the column members `members`. */
export const expected = (region: string | null, members: unknown[], metric: string) => facts
  .filter(f => (region === null || f.region === region) && members.every((m, i) => f[COLUMN_FIELDS[i]] === m))
  .reduce((sum, f) => sum + (metric === 'sum_qty' ? f.qty : f.price), 0);

/** A leaf column's column members: its path without the metric. */
export const leafMembers = (leaf): unknown[] => (leaf.path ?? []).filter(m => m !== leaf.metric);
