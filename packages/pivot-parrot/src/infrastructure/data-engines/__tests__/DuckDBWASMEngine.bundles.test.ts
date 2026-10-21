import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DuckDBWASMEngine } from '../DuckDBWASMEngine';

const JSDELIVR = {
  mvp: { mainModule: 'https://cdn.jsdelivr.net/duckdb-mvp.wasm', mainWorker: 'https://cdn.jsdelivr.net/duckdb-browser-mvp.worker.js' },
  eh: { mainModule: 'https://cdn.jsdelivr.net/duckdb-eh.wasm', mainWorker: 'https://cdn.jsdelivr.net/duckdb-browser-eh.worker.js' }
};

function fakeDuckDB() {
  const instantiate = vi.fn().mockResolvedValue(undefined);
  return {
    instantiate,
    module: {
      getJsDelivrBundles: vi.fn(() => JSDELIVR),
      selectBundle: vi.fn(async (bundles: any) => ({ ...bundles.eh, pthreadWorker: null })),
      VoidLogger: class {},
      AsyncDuckDB: class {
        instantiate = instantiate;
        connect = vi.fn().mockResolvedValue({});
      }
    }
  };
}

let workerScripts: string[];

beforeEach(() => {
  workerScripts = [];
  vi.stubGlobal('Worker', class { constructor(_url: string) {} });
  vi.stubGlobal('Blob', class { constructor(parts: string[]) { workerScripts.push(parts.join('')); } });
  URL.createObjectURL = vi.fn(() => 'blob:worker');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DuckDBWASMEngine bundles', () => {
  it('loads the bundles it is given, resolved against the page, and never asks jsDelivr', async () => {
    const duckdb = fakeDuckDB();
    const bundles = {
      mvp: { mainModule: '/assets/duckdb-mvp.wasm', mainWorker: '/assets/duckdb-browser-mvp.worker.js' },
      eh: { mainModule: '/assets/duckdb-eh.wasm', mainWorker: '/assets/duckdb-browser-eh.worker.js' }
    };

    await new DuckDBWASMEngine(duckdb.module, { bundles }).init();

    expect(duckdb.module.getJsDelivrBundles).not.toHaveBeenCalled();
    const origin = window.location.origin;
    expect(duckdb.instantiate).toHaveBeenCalledWith(`${origin}/assets/duckdb-eh.wasm`, null);
    expect(workerScripts).toEqual([`importScripts("${origin}/assets/duckdb-browser-eh.worker.js");`]);
  });

  it('falls back to jsDelivr when no bundles are given', async () => {
    const duckdb = fakeDuckDB();

    await new DuckDBWASMEngine(duckdb.module).init();

    expect(duckdb.module.getJsDelivrBundles).toHaveBeenCalled();
    expect(duckdb.instantiate).toHaveBeenCalledWith(JSDELIVR.eh.mainModule, null);
  });
});
