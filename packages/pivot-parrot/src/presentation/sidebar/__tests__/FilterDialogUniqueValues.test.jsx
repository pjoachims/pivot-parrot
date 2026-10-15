/**
 * Unique values in the filter dialog, fetched through DialogsManager from a
 * DataEngine that runs real DuckDB SQL.
 */

import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DuckDBInstance } from '@duckdb/node-api';
import { DialogsManager } from '../dialogs/DialogsManager';
import { createPivotStore, PivotStoreContext } from '../../../application/state/store';
import { DataEngine } from '../../../infrastructure/data-engines/DataEngine';
import { DuckDBDialect } from '../../../domain/query/dialects/DuckDBDialect';
import { FieldKind } from '../../../domain/models/types';

class NodeDuckDBEngine extends DataEngine {
  constructor(conn) {
    super();
    this.conn = conn;
    this.dialect = new DuckDBDialect();
  }

  getDialect() {
    return this.dialect;
  }

  async _executeQueryImpl(sql) {
    const data = (await this.conn.runAndReadAll(sql)).getRowObjectsJson();
    return { data, dtypes: {}, rowCount: data.length, columnCount: 1 };
  }
}

async function makeEngine() {
  const instance = await DuckDBInstance.create(':memory:');
  const conn = await instance.connect();
  await conn.run(`CREATE TABLE pivot_data AS
    SELECT CASE WHEN i % 2 = 0 THEN 'a' ELSE 'b' END AS region, 'id_' || lpad(i::VARCHAR, 4, '0') AS order_id
    FROM range(1500) t(i)`);
  return new NodeDuckDBEngine(conn);
}

function showFilterDialog(engine, field, availableFields = [field], store = createPivotStore()) {
  store.setState({ availableFields, filterDialog: { field, existingFilter: null, anchorEl: document.createElement('div') } });
  const view = render(
    <PivotStoreContext.Provider value={{ store, instanceKey: 'test' }}>
      <DialogsManager dataEngine={engine} snapshots={[]} />
    </PivotStoreContext.Provider>
  );
  fireEvent.click(screen.getByText(/One Of/i));
  return { store, view };
}

function openFilterDialog(engine, field, availableFields = [field]) {
  const opened = showFilterDialog(engine, field, availableFields);
  fireEvent.click(screen.getByText(/Fetch Unique Values/i));
  return opened;
}

describe('filter dialog unique values', () => {
  let engine;

  beforeEach(async () => {
    engine = await makeEngine();
  });

  it('caps a high-cardinality field and says so', async () => {
    const result = await engine.getUniqueValues('order_id');
    expect(result.values).toHaveLength(1000);
    expect(result.truncated).toBe(true);

    openFilterDialog(engine, { id: 'order_id', name: 'order_id', dtype: 'string', kind: FieldKind.BASE_FIELD });
    expect(await screen.findByText(/first 1000 values/i)).toBeInTheDocument();
  });

  it('still says the list is cut when reopened from the cache', async () => {
    const orderId = { id: 'order_id', name: 'order_id', dtype: 'string', kind: FieldKind.BASE_FIELD };
    const { store, view } = openFilterDialog(engine, orderId);
    expect(await screen.findByText(/first 1000 values/i)).toBeInTheDocument();
    view.unmount();

    showFilterDialog(engine, orderId, [orderId], store);
    expect(screen.queryByText(/Fetch Unique Values/i)).not.toBeInTheDocument();
    expect(screen.getByText(/first 1000 values/i)).toBeInTheDocument();
  });

  it('is not truncated when every value fits', async () => {
    const result = await engine.getUniqueValues('region');
    expect(result).toEqual({ values: ['a', 'b'], truncated: false });
  });

  it('resolves a derived field through its formula', async () => {
    openFilterDialog(engine, {
      id: 'region_upper',
      name: 'region_upper',
      dtype: 'string',
      kind: FieldKind.DERIVED_FIELD,
      formula: 'upper(region)'
    });
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.queryByText(/first 1000 values/i)).not.toBeInTheDocument();
  });

  it('resolves {{}} references in a derived field formula', async () => {
    const upper = { id: 'region_upper', name: 'region_upper', dtype: 'string', kind: FieldKind.DERIVED_FIELD, formula: 'upper(region)' };
    const tagged = { id: 'region_tag', name: 'region_tag', dtype: 'string', kind: FieldKind.DERIVED_FIELD, formula: "{{region_upper}} || '!'" };
    openFilterDialog(engine, tagged, [upper, tagged]);
    await waitFor(() => expect(screen.getByText('A!')).toBeInTheDocument());
    expect(screen.getByText('B!')).toBeInTheDocument();
  });

  describe('narrowed by the other active filters', () => {
    const region = { id: 'region', name: 'region', dtype: 'string', kind: FieldKind.BASE_FIELD };
    const orderId = { id: 'order_id', name: 'order_id', dtype: 'string', kind: FieldKind.BASE_FIELD };
    const orderNo = { id: 'order_no', name: 'order_no', dtype: 'int32', kind: FieldKind.DERIVED_FIELD, formula: "CAST(substr(order_id, 4) AS INTEGER)" };

    async function fetchRegionsWith(config) {
      const store = createPivotStore();
      store.setState({ config: { ...store.getState().config, ...config } });
      showFilterDialog(engine, region, [region, orderId, orderNo], store);
      fireEvent.click(screen.getByText(/Fetch Unique Values/i));
      fireEvent.click(await screen.findByText(/^Fetch$/));
    }

    it('while a custom metric is in Values', async () => {
      await fetchRegionsWith({
        values: [{ field: 'm_rate', aggregation: 'custom', isCustom: true }],
        customMetrics: [{ id: 'm_rate', name: 'Rate', expr: 'count(*) / 2' }],
        filters: [{ field: 'order_id', type: 'equal', value: 'id_0001' }]
      });
      await waitFor(() => expect(screen.getByText('b')).toBeInTheDocument());
      expect(screen.queryByText('a')).not.toBeInTheDocument();
    });

    it('on a derived field', async () => {
      await fetchRegionsWith({ filters: [{ field: 'order_no', type: 'equal', value: '2' }] });
      await waitFor(() => expect(screen.getByText('a')).toBeInTheDocument());
      expect(screen.queryByText('b')).not.toBeInTheDocument();
    });
  });
});
