import { describe, it, expect } from 'vitest';
import { buildFieldTree, matchesSearch, normalizePath } from '../fieldTree';
import { fromSchema } from '../FieldItem';
import { RemoteDataEngine } from '../../../infrastructure/data-engines/RemoteDataEngine';

type L = { id: string; path?: string[] };
const tree = (leaves: L[]) => buildFieldTree(leaves, l => l.path);
const ids = (ls: L[]) => ls.map(l => l.id);

describe('buildFieldTree', () => {
  it('keeps a list without paths flat and in order', () => {
    const t = tree([{ id: 'b' }, { id: 'a' }, { id: 'c' }]);
    expect(t.folders).toEqual([]);
    expect(ids(t.leaves)).toEqual(['b', 'a', 'c']);
  });

  it('nests by path, folders in order of first appearance, loose fields at the top level', () => {
    const t = tree([
      { id: 'brand', path: ['Article'] },
      { id: 'loose' },
      { id: 'hub', path: ['Hub'] },
      { id: 'cat1', path: ['Article', 'Category'] },
      { id: 'name', path: ['Article'] },
    ]);
    expect(t.folders.map(f => f.name)).toEqual(['Article', 'Hub']);
    expect(ids(t.leaves)).toEqual(['loose']);
    const article = t.folders[0];
    expect(ids(article.leaves)).toEqual(['brand', 'name']);
    expect(article.folders.map(f => [f.name, f.depth, ids(f.leaves)])).toEqual([['Category', 1, ['cat1']]]);
    expect(article.depth).toBe(0);
  });

  it('keys a folder by its whole path, so equal names in different parents stay apart', () => {
    const t = tree([{ id: 'x', path: ['A', 'Same'] }, { id: 'y', path: ['B', 'Same'] }]);
    const [a, b] = t.folders;
    expect(a.folders[0].key).not.toBe(b.folders[0].key);
    expect(ids(a.folders[0].leaves)).toEqual(['x']);
  });

  it('lets a folder name contain a slash', () => {
    const t = tree([{ id: 'x', path: ['Price / Unit'] }]);
    expect(t.folders.map(f => f.name)).toEqual(['Price / Unit']);
  });
});

describe('normalizePath', () => {
  it('keeps non-empty string segments only', () => {
    expect(normalizePath([' Article ', '', 'Category'])).toEqual(['Article', 'Category']);
    expect(normalizePath([])).toBeUndefined();
    expect(normalizePath('Article/Category')).toBeUndefined();
    expect(normalizePath(undefined)).toBeUndefined();
  });
});

describe('matchesSearch', () => {
  it('matches any text case-insensitively, everything on an empty query', () => {
    expect(matchesSearch('kat', ['Kategorie 1'])).toBe(true);
    expect(matchesSearch('artikel', ['Marke', 'brand_name', 'Artikel'])).toBe(true);
    expect(matchesSearch('hub', ['Marke'])).toBe(false);
    expect(matchesSearch('  ', ['Marke'])).toBe(true);
  });
});

describe('path from the schema', () => {
  it('fromSchema carries a valid path and drops an invalid one', () => {
    expect(fromSchema({ name: 'a', type: 'string', path: ['Article'] }).path).toEqual(['Article']);
    expect('path' in fromSchema({ name: 'a', type: 'string', path: 'Article' })).toBe(false);
  });

  it('a remote schema column with a path becomes a field with that path', async () => {
    const engine = new RemoteDataEngine({
      executeQuery: async () => ({ rows: [] }),
      dialect: 'duckdb',
      schema: [{ name: 'category_1', type: 'VARCHAR', path: ['Article', 'Category'] }, { name: 'region', type: 'VARCHAR' }],
    });
    const fields = await engine.getAvailableFields();
    expect(fields.map((f: any) => [f.id, f.path])).toEqual([['category_1', ['Article', 'Category']], ['region', undefined]]);
  });
});
