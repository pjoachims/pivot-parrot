import React from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import JSZip from 'jszip';
import { createPivotStore, PivotStoreContext } from '../../state/store';
import { usePivotHandlers } from '../usePivotHandlers';
import { buildPivotDisplayData } from '../../../domain/pivot/index';

afterEach(() => vi.restoreAllMocks());

it('the test-fixture zip carries the cube rows and the expected pivot CSV', async () => {
  const config = { rows: ['region'], columns: [], values: [{ field: 'sales', aggregation: 'sum' }], filters: [] };
  const cubeResults = [
    { region: 'Nord', sum_sales: 1.5, _grouping_region: 0 },
    { region: null, sum_sales: 1.5, _grouping_region: 1 }
  ];
  const displayData = buildPivotDisplayData(cubeResults, ['region'], [], config.values);
  const files: Record<string, string> = {};
  vi.spyOn(JSZip.prototype, 'file').mockImplementation(function (this: any, name: any, content: any) {
    files[name] = content;
    return this;
  } as any);
  vi.spyOn(JSZip.prototype, 'generateAsync').mockResolvedValue(new Blob() as any);
  URL.createObjectURL = vi.fn(() => 'blob:x') as any;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

  const store = createPivotStore('fixture-zip-test');
  const wrapper = ({ children }: any) => (
    <PivotStoreContext.Provider value={{ store, instanceKey: 'fixture-zip-test' }}>{children}</PivotStoreContext.Provider>
  );
  const { result } = renderHook(() => usePivotHandlers({
    calculation: { cubeResults, dtypes: {} },
    displayData,
    snapshots: {},
    drilldown: {},
    sqlPlayground: {},
    splitPane: {},
    config,
    executionConfig: config,
    activeView: null,
    secondaryDisplayMode: 'hidden',
    chartConfig: null,
    availableFields: [],
    detectedTypes: {}
  } as any), { wrapper });

  await act(() => result.current.handleDownloadTestFixtureZip());

  expect(files['cube_results.csv']).toBe('region,sum_sales,_grouping_region\nNord,1.5,0\n,1.5,1');
  expect(files['expected_output.csv']).toBe('region,sum_sales\nNord,1.5\nGrand Total,1.5');
});
