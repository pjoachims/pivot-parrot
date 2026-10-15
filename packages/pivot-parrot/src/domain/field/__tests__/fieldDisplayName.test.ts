import { describe, it, expect } from 'vitest';
import { fieldDisplayName, valueDisplayName } from '../fieldDisplayName';

const availableFields = [
  { id: 'category_1', name: 'category_1' },
  { id: 'region', name: 'Sales Region' },
  { id: 'net_revenue', name: 'net_revenue' }
];

const config = {
  fieldNameOverrides: { category_1: 'Kategorie 1', net_revenue: 'Nettoumsatz', margin: 'Marge' },
  customMetrics: [{ id: 'margin', name: 'Margin' }, { id: 'aov', name: 'Average Order Value' }],
  customGroupings: [{ id: 'bucket', name: 'Revenue Bucket' }],
  customFilters: [{ id: 'big', name: 'Big Orders' }],
  values: [
    { field: 'net_revenue', aggregation: 'sum' },
    { field: 'aov', aggregation: 'custom', isCustom: true }
  ]
};

describe('fieldDisplayName', () => {
  it('prefers the override over every other name', () => {
    expect(fieldDisplayName('category_1', config, availableFields)).toBe('Kategorie 1');
    expect(fieldDisplayName('margin', config, availableFields)).toBe('Marge');
  });

  it('falls back to the custom metric, grouping or filter name', () => {
    expect(fieldDisplayName('aov', config, availableFields)).toBe('Average Order Value');
    expect(fieldDisplayName('bucket', config, availableFields)).toBe('Revenue Bucket');
    expect(fieldDisplayName('big', config, availableFields)).toBe('Big Orders');
  });

  it('falls back to the field item name, then the id', () => {
    expect(fieldDisplayName('region', config, availableFields)).toBe('Sales Region');
    expect(fieldDisplayName('unknown', config, availableFields)).toBe('unknown');
    expect(fieldDisplayName('region', {})).toBe('region');
  });

  it('names an active aggregation by its source field display name', () => {
    expect(fieldDisplayName('SUM_net_revenue', config, availableFields)).toBe('SUM(Nettoumsatz)');
  });

  it('ignores an empty override', () => {
    expect(fieldDisplayName('region', { fieldNameOverrides: { region: '' } }, availableFields)).toBe('Sales Region');
  });
});

describe('valueDisplayName', () => {
  it('labels an aggregation with the source field display name', () => {
    expect(valueDisplayName({ field: 'net_revenue', aggregation: 'sum' }, config, availableFields)).toBe('sum of Nettoumsatz');
  });

  it('labels a custom value by the metric display name', () => {
    expect(valueDisplayName({ field: 'aov', aggregation: 'custom', isCustom: true }, config)).toBe('Average Order Value');
    expect(valueDisplayName({ field: 'margin', aggregation: 'custom', isCustom: true }, config)).toBe('Marge');
  });
});
