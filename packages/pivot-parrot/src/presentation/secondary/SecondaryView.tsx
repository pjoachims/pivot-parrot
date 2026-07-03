import React from 'react';
import ChartView from '../charts/ChartView';
import DrilldownView from '../drilldown/DrilldownView';
import SQLPlayground from './SQLPlayground';

/**
 * SecondaryView - Reusable container for chart, drilldown, or SQL playground
 * Displays one secondary view at a time
 */
export default function SecondaryView({
  viewType, // 'chart', 'drilldown', or 'sql'

  // Chart props
  chartConfig,
  cubeResults,
  config,
  fields,
  dialect,
  dtypes,

  // Drilldown props
  drilldownData,
  drilldownFilters,
  drilldownSQL,
  drilldownDtypes,
  drilldownDisplayMode,
  onDrilldownDisplayModeChange,
  onDrilldownExportCSV,
  fieldTypes,
  locale,

  // SQL Playground props
  sqlQuery,
  onSQLChange,
  onExecuteSQL,
  sqlPlaygroundDisplayMode,
  onSQLPlaygroundDisplayModeChange
}) {
  if (viewType === 'chart' && chartConfig) {
    return (
      <ChartView
        chartConfig={chartConfig}
        cubeResults={cubeResults}
        config={config}
        fields={fields}
        dialect={dialect}
        dtypes={dtypes}
      />
    );
  }

  if (viewType === 'drilldown' && drilldownData) {
    return (
      <DrilldownView
        drilldownData={drilldownData}
        filters={drilldownFilters}
        sql={drilldownSQL}
        dtypes={drilldownDtypes}
        onExportCSV={onDrilldownExportCSV}
        drilldownDisplayMode={drilldownDisplayMode}
        onDrilldownDisplayModeChange={onDrilldownDisplayModeChange}
        locale={locale}
      />
    );
  }

  if (viewType === 'sql') {
    return (
      <SQLPlayground
        sql={sqlQuery}
        onSQLChange={onSQLChange}
        onExecuteSQL={onExecuteSQL}
        sqlPlaygroundDisplayMode={sqlPlaygroundDisplayMode}
        onSQLPlaygroundDisplayModeChange={onSQLPlaygroundDisplayModeChange}
      />
    );
  }

  return null;
}
