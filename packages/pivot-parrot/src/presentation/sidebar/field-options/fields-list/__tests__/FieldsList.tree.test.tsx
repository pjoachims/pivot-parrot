import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { createPivotStore, PivotStoreContext } from '../../../../../application/state/store';
import FieldsList from '../FieldsList';
import { fromSchema } from '../../../../../domain/field/FieldItem';

const schema = [
  { name: 'article_name', type: 'string', path: ['Artikel'] },
  { name: 'category_1', type: 'string', path: ['Artikel', 'Kategorie'] },
  { name: 'region', type: 'string', path: ['Hub'] },
  { name: 'loose_dim', type: 'string' },
];

const metrics = [
  { id: 'umsatz', name: 'Umsatz', expr: 'SUM(x)', path: ['Kennzahlen', 'Umsatz & Absatz'] },
  { id: 'marge', name: 'Marge', expr: 'SUM(y)', path: ['Kennzahlen', 'Marge'] },
  { id: 'own', name: 'Meine Kennzahl', expr: 'SUM(z)' },
];

const labels = { article_name: 'Artikelname', category_1: 'Kategorie 1', region: 'Region', loose_dim: 'Lose' };

let store: any;
const renderList = () => render(
  <PivotStoreContext.Provider value={{ store, instanceKey: 'tree' }}>
    <FieldsList />
  </PivotStoreContext.Provider>
);
const folder = (name: string) => screen.getByRole('button', { name });
const search = (q: string) => act(() => { store.getState().setSearchQuery(q); });

function setup(fields = schema, customMetrics: any[] = metrics) {
  store = createPivotStore('tree');
  act(() => {
    store.getState().setAvailableFields(fields.map(c => fromSchema(c)));
    store.getState().setDetectedTypes(Object.fromEntries(fields.map(c => [c.name, 'string'])));
    store.getState().setConfig({
      rows: [], columns: [], values: [], filters: [],
      customMetrics, customFilters: [], customGroupings: [],
      fieldNameOverrides: labels,
    });
  });
}

describe('FieldsList as a tree', () => {
  beforeEach(() => setup());

  it('starts with folders closed and loose fields at the top level', () => {
    renderList();
    expect(folder('Artikel')).toHaveAttribute('aria-expanded', 'false');
    expect(folder('Hub')).toBeInTheDocument();
    expect(folder('Kennzahlen')).toBeInTheDocument();
    expect(screen.getByText('Lose')).toBeInTheDocument();
    expect(screen.getByText('Meine Kennzahl')).toBeInTheDocument();
    expect(screen.queryByText('Artikelname')).not.toBeInTheDocument();
    expect(screen.queryByText('Umsatz')).not.toBeInTheDocument();
  });

  it('opens and closes a folder and its subfolder, and remembers it across a remount', () => {
    const { unmount } = renderList();
    fireEvent.click(folder('Artikel'));
    expect(screen.getByText('Artikelname')).toBeInTheDocument();
    expect(screen.queryByText('Kategorie 1')).not.toBeInTheDocument();
    fireEvent.click(folder('Kategorie'));
    expect(screen.getByText('Kategorie 1')).toBeInTheDocument();
    unmount();

    renderList();
    expect(screen.getByText('Kategorie 1')).toBeInTheDocument();
    fireEvent.click(folder('Artikel'));
    expect(screen.queryByText('Artikelname')).not.toBeInTheDocument();
    expect(screen.queryByText('Kategorie 1')).not.toBeInTheDocument();
  });

  it('shows a search hit inside closed folders with its path open, and nothing else', () => {
    renderList();
    search('kategorie 1');
    expect(screen.getByText('Kategorie 1')).toBeInTheDocument();
    expect(folder('Artikel')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByText('Artikelname')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hub' })).not.toBeInTheDocument();

    search('');
    expect(screen.queryByText('Kategorie 1')).not.toBeInTheDocument();
  });

  it('finds a folder name: all of its fields show', () => {
    renderList();
    const metric = (name: string) => screen.queryByRole('checkbox', { name: `Include ${name} (custom metric)` });
    search('kennzahlen');
    expect(metric('Umsatz')).toBeInTheDocument();
    expect(metric('Marge')).toBeInTheDocument();
    expect(metric('Meine Kennzahl')).not.toBeInTheDocument();
  });

  it('says so when nothing matches', () => {
    renderList();
    search('nichts');
    expect(screen.getByText('No fields matching "nichts"')).toBeInTheDocument();
  });

  it('drags a field out of a folder like any field', () => {
    renderList();
    fireEvent.click(folder('Hub'));
    const row = screen.getByText('Region').closest('[draggable="true"]')!;
    const data: Record<string, string> = {};
    fireEvent.dragStart(row, { dataTransfer: { setData: (k: string, v: string) => { data[k] = v; } } });
    expect(JSON.parse(data['text/plain'])).toEqual({ fieldName: 'region', sourceZone: 'list' });
  });

  it('checks a field inside a folder into the pivot and marks the folder as in use', () => {
    renderList();
    fireEvent.click(folder('Kennzahlen'));
    fireEvent.click(folder('Marge'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include Marge (custom metric)' }));
    expect(store.getState().config.values.map((v: any) => v.field)).toEqual(['marge']);
    expect(folder('Kennzahlen')).toHaveClass('pp-folder-row--used');
    expect(folder('Artikel')).not.toHaveClass('pp-folder-row--used');
  });

  it('renders flat without any path: fields, then metrics, no folders', () => {
    setup(schema.map(({ path, ...c }) => c), metrics.map(({ path, ...m }) => m));
    renderList();
    expect(screen.queryByRole('button', { expanded: false })).not.toBeInTheDocument();
    const labelsInOrder = [...document.querySelectorAll('.pp-field-row__label')].map(l => l.textContent);
    expect(labelsInOrder).toEqual(['Artikelname', 'Kategorie 1', 'Region', 'Lose', 'Umsatz', 'Marge', 'Meine Kennzahl']);
  });
});
