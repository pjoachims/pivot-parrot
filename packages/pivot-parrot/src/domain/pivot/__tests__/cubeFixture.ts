export type Fact = Record<string, string | number>;

/** Every grouping set of `dims` over `facts`, shaped like the engine's CUBE rows. */
export function cube(facts: Fact[], dims: string[]): any[] {
  const rows = new Map<string, any>();
  for (let mask = 0; mask < 1 << dims.length; mask++) {
    for (const fact of facts) {
      const row: any = {};
      dims.forEach((d, i) => {
        const grouped = (mask >> i) & 1;
        row[d] = grouped ? null : fact[d];
        row[`_grouping_${d}`] = grouped;
      });
      const key = JSON.stringify(row);
      const acc = rows.get(key) ?? { ...row, sum_sales: 0 };
      acc.sum_sales += fact.sales as number;
      rows.set(key, acc);
    }
  }
  return [...rows.values()];
}
