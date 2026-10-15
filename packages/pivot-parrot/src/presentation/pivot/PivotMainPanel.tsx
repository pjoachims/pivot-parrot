import React from 'react';
import PivotDisplay from '../pivot-table/PivotDisplay';
import ChartDialog from '../charts/ChartDialog';
import SecondaryView from '../secondary/SecondaryView';
import ErrorBanner from '../shared/ErrorBanner';
import { usePivotStore } from '../../application/state/store';
import type { DataEngine } from '../../infrastructure/data-engines/DataEngine';
import type {
  CalculationState,
  DrilldownState,
  SQLPlaygroundState,
  SplitPaneState,
  PivotHandlers
} from './types';

interface PivotMainPanelProps {
  // Calculation data (from hooks)
  calculation: CalculationState;

  // Display data (from usePivotDisplay)
  displayData: any;

  // Execution config (committed config that produced displayData)
  executionConfig: any;

  // Drilldown (from hook)
  drilldown: DrilldownState;

  // SQL Playground (from hook)
  sqlPlayground: SQLPlaygroundState;

  // Split pane (from hook)
  splitPane: SplitPaneState;

  // Data engine
  dataEngine: DataEngine;

  // Settings
  locale?: string;
  enableSQLPlayground?: boolean;

  // Handlers
  handlers: PivotHandlers;
}

const styles = {
  mainPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    position: 'relative' as const,
    overflow: 'hidden',
    background: 'var(--surface-bg)'
  },
  displayPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    background: 'var(--surface-bg)',
    overflow: 'auto' as const
  },
  loading: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    color: 'var(--text-muted)',
    fontSize: 'var(--text-base)'
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-muted)',
    textAlign: 'center' as const
  },
  emptyIcon: {
    marginBottom: '1rem',
    opacity: 0.5
  },
  emptyText: {
    fontSize: '1rem',
    fontWeight: 500
  },
  divider: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
    userSelect: 'none' as const,
    position: 'relative' as const
  },
  dividerHandle: {
    backgroundColor: 'var(--border-color-dark)',
    borderRadius: '2px',
    position: 'absolute' as const
  }
};

export const PivotMainPanel: React.FC<PivotMainPanelProps> = ({
  calculation,
  displayData,
  executionConfig,
  drilldown,
  sqlPlayground,
  splitPane,
  dataEngine,
  locale,
  enableSQLPlayground,
  handlers
}) => {
  // Get state from store
  const config = usePivotStore((s) => s.config);
  const availableFields = usePivotStore((s) => s.availableFields);
  const detectedTypes = usePivotStore((s) => s.detectedTypes);
  const dataLoading = usePivotStore((s) => s.dataLoading);
  const activeView = usePivotStore((s) => s.activeView);
  const secondaryDisplayMode = usePivotStore((s) => s.secondaryDisplayMode);
  const showChartDialog = usePivotStore((s) => s.showChartDialog);
  const chartConfig = usePivotStore((s) => s.chartConfig);

  // Get actions from store
  const closeChartDialog = usePivotStore((s) => s.closeChartDialog);
  const setChartConfig = usePivotStore((s) => s.setChartConfig);
  const setActiveView = usePivotStore((s) => s.setActiveView);
  const setSecondaryDisplayMode = usePivotStore((s) => s.setSecondaryDisplayMode);

  return (
    <div style={styles.mainPanel}>
      <div style={styles.displayPanel}>
        {/* Error State */}
        {calculation.error && (
          <ErrorBanner
            title="Error"
            message={calculation.error}
            onDismiss={() => calculation.setError(null)}
            style={{ margin: '1rem' }}
          />
        )}

        {/* Display Error (e.g., too many columns) */}
        {displayData?.error && (
          <ErrorBanner
            title="Display Limit Exceeded"
            message={displayData.error}
            style={{ margin: '1rem' }}
          />
        )}

        {/* Loading State */}
        {dataLoading && (
          <div style={styles.loading}>
            <span className="pp-spinner" aria-hidden="true" />
            Loading data...
          </div>
        )}

        {/* Empty State */}
        {!displayData && !calculation.calculating && !calculation.error && !dataLoading && (
          <div style={styles.empty}>
            <svg style={styles.emptyIcon} width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
            <p style={styles.emptyText}>
              {!config.values.length
                ? 'Add at least one field to Values'
                : 'Add fields to Rows or Columns'}
            </p>
          </div>
        )}

        {/* Data Display */}
        {displayData && !displayData.error && !calculation.calculating && (
          <>
            <div className="split-container" style={{
              display: 'flex',
              flexDirection: (secondaryDisplayMode === 'split-below' ? 'column' : 'row') as React.CSSProperties['flexDirection'],
              height: '100%',
              overflow: 'hidden',
              position: 'relative'
            }}>
              {/* Table View */}
              {secondaryDisplayMode !== 'full' && (
                <div style={{
                  width: activeView && secondaryDisplayMode === 'split-right' ? `${splitPane.splitPosition}%` : '100%',
                  height: activeView && secondaryDisplayMode === 'split-below' ? `${splitPane.splitPosition}%` : '100%',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column' as const,
                  flex: activeView ? '0 0 auto' : '0 1 98%',
                  flexShrink: activeView ? 0 : 1
                }}>
                  <PivotDisplay
                    data={displayData}
                    cubeResults={calculation.cubeResults}
                    dtypes={calculation.dtypes}
                    dataEngine={dataEngine}
                    rowFields={executionConfig?.rows.map((f: any) => typeof f === 'string' ? f : f.id) || []}
                    detectedTypes={detectedTypes}
                    availableFields={availableFields}
                    config={executionConfig || config}
                    locale={locale}
                    onDrilldown={handlers.handleDrilldown}
                    onOpenSQL={enableSQLPlayground ? handlers.handleOpenSQL : null}
                  />
                </div>
              )}

              {/* Draggable Divider */}
              {(secondaryDisplayMode === 'split-right' || secondaryDisplayMode === 'split-below') && activeView && (
                <div
                  onMouseDown={splitPane.handleMouseDown}
                  style={{
                    ...styles.divider,
                    cursor: secondaryDisplayMode === 'split-right' ? 'col-resize' : 'row-resize',
                    width: secondaryDisplayMode === 'split-right' ? '6px' : '100%',
                    height: secondaryDisplayMode === 'split-below' ? '6px' : '100%',
                    backgroundColor: splitPane.isDragging ? 'var(--color-accent)' : 'var(--border-color-light)'
                  }}
                >
                  <div style={{
                    ...styles.dividerHandle,
                    width: secondaryDisplayMode === 'split-right' ? '2px' : '40px',
                    height: secondaryDisplayMode === 'split-below' ? '2px' : '40px'
                  }} />
                </div>
              )}

              {/* Secondary View (Chart/Drilldown/SQL) */}
              {activeView && (
                <div style={{
                  flex: 1,
                  overflow: 'hidden',
                  minWidth: 0,
                  minHeight: 0,
                  position: 'relative'
                }}>
                  <SecondaryView
                    viewType={activeView}
                    chartConfig={chartConfig}
                    cubeResults={calculation.cubeResults}
                    config={executionConfig}
                    fields={detectedTypes}
                    dialect={dataEngine?.getDialect()}
                    dtypes={calculation.dtypes}
                    drilldownData={drilldown.drilldownData}
                    drilldownFilters={drilldown.drilldownFilters}
                    drilldownSQL={drilldown.drilldownSQL}
                    drilldownDtypes={drilldown.drilldownDtypes}
                    drilldownDisplayMode={secondaryDisplayMode}
                    onDrilldownDisplayModeChange={handlers.handleSecondaryDisplayModeChange}
                    onDrilldownExportCSV={drilldown.exportDrilldownCSV}
                    fieldTypes={detectedTypes}
                    locale={locale}
                    sqlQuery={sqlPlayground.sqlQuery}
                    onSQLChange={sqlPlayground.setSQLQuery}
                    onExecuteSQL={handlers.handleExecuteSQL}
                    sqlPlaygroundDisplayMode={secondaryDisplayMode}
                    onSQLPlaygroundDisplayModeChange={handlers.handleSecondaryDisplayModeChange}
                  />
                </div>
              )}
            </div>

            {/* Chart Configuration Dialog */}
            {showChartDialog && (
              <ChartDialog
                key="chart-dialog"
                config={config}
                fields={detectedTypes}
                chartDisplayMode={secondaryDisplayMode}
                initialChartConfig={chartConfig}
                onGenerate={(chartCfg, mode) => {
                  setChartConfig({ ...chartCfg, _updateKey: Date.now() });
                  setActiveView('chart');

                  const saved = splitPane.savedViewStates.chart;
                  const displayMode = (mode || saved.mode) as 'hidden' | 'full' | 'split-below' | 'split-right';
                  setSecondaryDisplayMode(displayMode);
                  splitPane.setSplitPosition(saved.position);

                  closeChartDialog();
                }}
                onCancel={() => closeChartDialog()}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};
