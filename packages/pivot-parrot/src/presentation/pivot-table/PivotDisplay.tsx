import React, { useState, useRef, useMemo, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { styles } from './styles';
import { createFormatValue, createFormatRowLabel } from '../../application/utils/formatters';
import { SubtotalsMenu, ValuesFormatMenu, RowsOptionsMenu, SortMenu } from './PivotMenus';
import { ColumnHeaders } from './ColumnHeaders';
import { fieldDisplayName } from '../../domain/field/fieldDisplayName';
import { PivotRow, renderCells } from './PivotRow';
import PivotDisplayHeader from './PivotDisplayHeader';
import { ContextMenu } from '../shared/ContextMenu';
import { ChevronContextMenu } from '../shared/ChevronContextMenu';
import { useClickOutside } from '../shared/useClickOutside';
import { useExpansionState } from '../../application/hooks/useExpansionState';
import { rowKey } from '../../application/utils/treeOperations';
import { useContextMenus } from '../../application/hooks/useContextMenus';
import { usePivotStore } from '../../application/state/store';

const ROW_HEIGHT = 25; // Single source of truth for row height

interface PivotDisplayProps {
  data: any;
  cubeResults: any;
  dtypes?: Record<string, any>;
  dataEngine?: any;
  rowFields: string[];
  detectedTypes?: Record<string, any>;
  derivedFieldsMap?: Record<string, any>;
  availableFields?: any[];
  config?: any;
  stickyHeaders?: boolean;
  title?: string;
  locale?: string;
  onDrilldown?: ((filters: any, sql: string) => void) | null;
  onOpenSQL?: (() => void) | null;
}

const PivotDisplay = memo(function PivotDisplay({ data, cubeResults, dtypes = {}, dataEngine = null, rowFields, detectedTypes = {}, derivedFieldsMap = {}, availableFields = [], config = {}, stickyHeaders = true, title = '', locale = 'en-US', onDrilldown = null, onOpenSQL = null }: PivotDisplayProps) {
    // Read display state from store (everything PivotDisplay needs is here now)
    // No more prop drilling for display state!
    const parentRef = useRef(null);
    const [showFieldMenu, setShowFieldMenu] = useState(null);
    const [showValuesMenu, setShowValuesMenu] = useState(false);
    const [showRowsMenu, setShowRowsMenu] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showDebug, setShowDebug] = useState(false);

    // Use config values for subtotals and grand totals (default to 'both' if not set)
    const subtotalsConfig = config.subtotals || 'both';
    const grandTotalsConfig = config.grandTotals || 'both';

    // Format configurations - default to 'number' for values, 'text' for rows
    const [valueFormats, setValueFormats] = useState({});
    const [rowFormats, setRowFormats] = useState({});

    // Expansion state management
    const { expanded, fieldExpanded, toggle, toggleField, foldLevel, unfoldLevel, foldAll, unfoldAll } = useExpansionState({
        data,
        rowFields
    });

    // Context menu management
    const {
        cellContextMenu,
        chevronContextMenu,
        handleCellContextMenu,
        handleChevronContextMenu,
        handleDrilldown,
        closeCellContextMenu,
        closeChevronContextMenu
    } = useContextMenus({
        availableFields,
        derivedFieldsMap,
        config,
        dataEngine,
        onDrilldown,
        dtypes
    });

    const colFields = config.columns || [];
    const rowFieldLabels = useMemo(() => (rowFields || []).map(f => fieldDisplayName(f, config, availableFields)), [rowFields, config, availableFields]);
    const colFieldLabels = useMemo(() => (config.columns || []).map(f => fieldDisplayName(f, config, availableFields)), [config, availableFields]);

    // Expose debug toggle to window for console access
    React.useEffect(() => {
      window.togglePivotDebug = () => {
        setShowDebug(prev => !prev);
      };
      return () => {
        delete window.togglePivotDebug;
      };
    }, []);

    // Close popovers when clicking outside any of them
    useClickOutside(['.pivot-menu-btn', '.pivot-gear-btn', '.pivot-popover-menu'], () => {
      setShowValuesMenu(false);
      setShowRowsMenu(false);
      setShowExportMenu(false);
      setShowFieldMenu(null);
    });

    if (!data || !data.columnConfig || !data.rowGroups) {
      return <div style={styles.empty}>No data to display</div>;
    }

    const handleValueFormatChange = (valueKey, format) => {
      setValueFormats(prev => ({ ...prev, [valueKey]: format }));
    };

    const handleRowFormatChange = (rowField, format) => {
      setRowFormats(prev => ({ ...prev, [rowField]: format }));
    };

    // Initialize formatters with current config and locale
    const dialect = dataEngine?.getDialect();
    const formatValue = useMemo(() => createFormatValue(config, locale, dtypes, dialect), [config, locale, dtypes, dialect]);
    const formatRowLabel = useMemo(() => createFormatRowLabel(rowFormats, detectedTypes, dtypes, dialect), [rowFormats, detectedTypes, dtypes, dialect]);

    // Determine what subtotals to show based on config
    const showColSubtotals = subtotalsConfig === 'col' || subtotalsConfig === 'both';
    const showRowSubtotals = subtotalsConfig === 'row' || subtotalsConfig === 'both';

    // Determine what grand totals to show based on config
    const showGrandTotalCol = grandTotalsConfig === 'col' || grandTotalsConfig === 'both';
    const showGrandTotalRow = grandTotalsConfig === 'row' || grandTotalsConfig === 'both';

    // Calculate max depth and collect leaf columns
    const hierarchy = data.columnConfig.hierarchy || [];
    function getMaxDepth(nodes, currentDepth=0){
      if(!nodes || nodes.length===0) return currentDepth;
      return Math.max(...nodes.map(n=> getMaxDepth(n.children, currentDepth+1)));
    }
    function collectLeaves(nodes, leaves=[]){
      nodes.forEach(node=>{
        if(node.children?.length>0) collectLeaves(node.children, leaves);
        else {
          // Filter grand total columns based on setting (check this first!)
          if(node.isGrandTotal && !showGrandTotalCol) return;
          // Filter subtotal columns based on mode (but not grand total)
          if(node.isSubtotal && !node.isGrandTotal && !showColSubtotals) return;
          leaves.push(node);
        }
      });
      return leaves;
    }
    const maxDepth = getMaxDepth(hierarchy);
    const leafColumns = collectLeaves(hierarchy);

    // Flatten tree into a list of visible rows based on expanded state
    const flattenedRows = useMemo(() => {
      const flat = [];

      function flattenNode(node, path = [], depth = 0) {
        const key = rowKey(node);
        const isOpen = !!expanded[key];
        const kids = node.children || [];
        const hasKids = kids.length > 0;

        // Skip null rows if explicitly configured to hide them (default: show as "(Blank)")
        if (config.showNullGroups === false && (node.groupLabel === '(null)' || node.groupLabel === null)) return;

        // Add this row
        flat.push({ node, path, depth, key, isOpen, hasKids });

        // If expanded, add children
        if (isOpen && hasKids) {
          kids.forEach((child, idx) => {
            flattenNode(child, [...path, idx], depth + 1);
          });
        }
      }

      data.rowGroups.forEach((group, idx) => {
        flattenNode(group, [idx], 0);
      });

      return flat;
    }, [data.rowGroups, expanded]);

    // Calculate grand total row count
    // When values in rows: grandTotal is array of {metric, values} objects
    // When values in columns: grandTotal is simple array of values
    const valuesInRows = rowFields && rowFields.some(f => f === 'Σ Values');

    // Check if grandTotal is array of metric objects (has 'metric' property)
    const isMultiMetricGrandTotal = Array.isArray(data.grandTotal) &&
                                    data.grandTotal.length > 0 &&
                                    data.grandTotal[0]?.metric;

    const grandTotalRowCount = showGrandTotalRow && data.grandTotal
      ? (isMultiMetricGrandTotal ? data.grandTotal.length : 1)
      : 0;

    // Set up virtualizer - include Grand Total row(s) in count if shown
    const rowVirtualizer = useVirtualizer({
      count: flattenedRows.length + grandTotalRowCount,
      getScrollElement: () => parentRef.current,
      estimateSize: () => ROW_HEIGHT,
      overscan: 10  // Render 10 extra rows above/below viewport
    });

  // Build rendering debug object
  const renderDebug = {
    settings: {
      subtotalsConfig,
      grandTotalsConfig,
      showRowSubtotals,
      showColSubtotals,
      showGrandTotalRow,
      showGrandTotalCol
    },
    columns: {
      leafCount: leafColumns.length,
      leaves: leafColumns.map(l => ({
        label: l.label || l.value,
        isSubtotal: l.isSubtotal,
        isGrandTotal: l.isGrandTotal
      }))
    },
    rows: data.rowGroups.map(r => ({
      label: r.groupLabel,
      depth: r.depth,
      hasChildren: !!(r.children?.length),
      hasValues: !!r.values,
      hasSubtotals: !!r.subtotals,
      subtotalsLength: r.subtotals?.length,
      valuesLength: r.values?.length,
      isSubtotalRow: !!(r.subtotals && r.children?.length),
      willRenderSubtotals: !!(r.subtotals && r.children?.length && showRowSubtotals)
    })),
    grandTotal: {
      exists: !!data.grandTotal,
      willRender: !!(showGrandTotalRow && data.grandTotal),
      length: data.grandTotal?.length
    }
  };

  // Check if we have no real grouping (just values, no rows/cols)
  const hasRealRows = rowFields && rowFields.length > 0 && rowFields.some(f => f !== 'Σ Values');
  const hasRealCols = data.columnConfig.colFields && data.columnConfig.colFields.length > 0 && data.columnConfig.colFields.some(f => f !== 'Σ Values');
  const isJustValues = !hasRealRows && !hasRealCols && data.grandTotal;

  return (<div style={styles.container}>
    {/* Debug Panel */}
    {showDebug && <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      background: 'rgba(0,0,0,0.8)',
      color: 'var(--text-inverse)',
      padding: '10px',
      fontSize: '10px',
      fontFamily: 'monospace',
      zIndex: 'var(--z-overlay)' as any,
      borderRadius: '4px'
    }}>
      <div style={{ borderBottom: '1px solid #666', paddingBottom: '5px', marginBottom: '5px', color: '#fbbf24' }}>Sticky Headers</div>
      <div>Sticky Enabled: {stickyHeaders ? 'YES' : 'NO'}</div>
      <div>Scroll Top: {parentRef.current?.scrollTop || 0}px</div>
      <div>Table Height: {rowVirtualizer.getTotalSize()}px</div>
      <div style={{ borderBottom: '1px solid #666', paddingBottom: '5px', marginBottom: '5px', marginTop: '5px', color: '#fbbf24' }}>Virtualization</div>
      <div>Virtualizer Count: {rowVirtualizer.options.count}</div>
      <div>Flattened Rows: {flattenedRows.length}</div>
      <div>Virtual Items: {rowVirtualizer.getVirtualItems().length}</div>
      {rowVirtualizer.getVirtualItems().length > 0 && (
        <>
          <div>First Index: {rowVirtualizer.getVirtualItems()[0].index}</div>
          <div>Last Index: {rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1].index}</div>
        </>
      )}
      <div>Total Size: {rowVirtualizer.getTotalSize()}px</div>
      <div>ScrollHeight: {parentRef.current?.scrollHeight || 0}px</div>
      <div>ClientHeight: {parentRef.current?.clientHeight || 0}px</div>
      <div>Has Scroll: {(parentRef.current?.scrollHeight || 0) > (parentRef.current?.clientHeight || 0) ? 'YES' : 'NO'}</div>
    </div>}

    {/* Top Bar */}
    <PivotDisplayHeader
      data={data}
      cubeResults={cubeResults}
      config={config}
      locale={locale}
      onDrilldown={onDrilldown}
      onOpenSQL={onOpenSQL}
    />

    <div style={{ padding: '8px', flex: 1, width: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div ref={parentRef} style={styles.wrapper}>
        <div style={{ position: 'relative' }}>
          <table style={styles.table}>
          <thead style={{
            display: 'table-header-group',
            ...(stickyHeaders && {
              position: 'sticky',
              top: 0,
              zIndex: 100, // local stacking context inside the scroll container, below the global overlay scale
              background: 'var(--surface-bg)'
            })
          }}>
            <ColumnHeaders
            data={data}
            leafColumns={leafColumns}
            rowFields={rowFields || []}
            colFields={colFields}
            rowFieldLabels={rowFieldLabels}
            colFieldLabels={colFieldLabels}
            title={title}
            styles={styles}
            dialect={dialect}
            dtypes={dtypes}
          />
        </thead>
        <tbody>
          {isJustValues ? (
            // When only values are selected (no rows, no columns), show Grand Total as the only row
            <tr style={styles.grandTotalRow}>
              <td style={styles.groupLabel}><span style={styles.groupText}>Total</span></td>
              {renderCells(data.grandTotal, leafColumns, styles, formatValue, null)}
            </tr>
          ) : (
            <>
              {/* Render visible rows with transform positioning */}
              {rowVirtualizer.getVirtualItems().map((virtualRow, index) => {
                // Check if this is a Grand Total row (at or after flattenedRows.length)
                const isGrandTotalRow = virtualRow.index >= flattenedRows.length;

                // Calculate transform offset: virtualRow.start - (index * virtualRow.size)
                const transformOffset = virtualRow.start - (index * ROW_HEIGHT);

                if (isGrandTotalRow && showGrandTotalRow && data.grandTotal) {
                  const grandTotalIndex = virtualRow.index - flattenedRows.length;

                  // Handle both formats: array of objects (values in rows) or simple array (values in columns)
                  if (isMultiMetricGrandTotal && data.grandTotal[grandTotalIndex]) {
                    // Multiple grand total rows (one per metric) - values in rows
                    const gtRow = data.grandTotal[grandTotalIndex];
                    return (
                      <tr
                        key={`grand-total-${gtRow.metric}`}
                        style={{
                          ...styles.grandTotalRow,
                          height: `${ROW_HEIGHT}px`,
                          transform: `translateY(${transformOffset}px)`
                        }}
                      >
                        <td style={{...styles.groupLabel, fontWeight: '600'}}>
                          <span style={styles.groupText}>Grand Total - {gtRow.metricLabel}</span>
                        </td>
                        {renderCells(gtRow.values, leafColumns, styles, formatValue, gtRow.metric, { groupLabel: 'Grand Total' }, rowFields, colFields, onDrilldown ? handleCellContextMenu : null)}
                      </tr>
                    );
                  } else if (!isMultiMetricGrandTotal && grandTotalIndex === 0) {
                    // Single grand total row (values in columns)
                    return (
                      <tr
                        key="grand-total"
                        style={{
                          ...styles.grandTotalRow,
                          height: `${ROW_HEIGHT}px`,
                          transform: `translateY(${transformOffset}px)`
                        }}
                      >
                        <td style={{...styles.groupLabel, fontWeight: '600'}}><span style={styles.groupText}>Grand Total</span></td>
                        {renderCells(data.grandTotal, leafColumns, styles, formatValue, null, { groupLabel: 'Grand Total' }, rowFields, colFields, onDrilldown ? handleCellContextMenu : null)}
                      </tr>
                    );
                  }
                }

                // Render regular row with transform positioning
                const rowData = flattenedRows[virtualRow.index];
                const { node, path, depth, key } = rowData;
                return (
                  <PivotRow
                    key={key}
                    node={node}
                    path={path}
                    depth={depth}
                    rowKey={key}
                    expanded={expanded}
                    toggle={toggle}
                    rowFields={rowFields}
                    formatRowLabel={formatRowLabel}
                    showRowSubtotals={showRowSubtotals}
                    styles={styles}
                    leafColumns={leafColumns}
                    formatValue={formatValue}
                    virtualStart={transformOffset}
                    rowHeight={ROW_HEIGHT}
                    colFields={colFields}
                    onCellContextMenu={onDrilldown ? handleCellContextMenu : null}
                    onChevronContextMenu={handleChevronContextMenu}
                  />
                );
              })}

              {/* Spacer row to extend table height for sticky headers */}
              {/* Calculate remaining space: total size minus space taken by rendered rows */}
              <tr style={{
                height: `${Math.max(0, rowVirtualizer.getTotalSize() - (rowVirtualizer.getVirtualItems().length * ROW_HEIGHT))}px`,
                visibility: 'hidden',
                pointerEvents: 'none'
              }}>
                <td colSpan={leafColumns.length + 1}></td>
              </tr>
            </>
          )}
        </tbody>
        </table>
        </div>
      </div>
    </div>

    {/* Context Menu */}
    {cellContextMenu && (
      <ContextMenu
        x={cellContextMenu.x}
        y={cellContextMenu.y}
        onClose={closeCellContextMenu}
        onDrilldown={handleDrilldown}
      />
    )}

    {/* Chevron Context Menu */}
    {chevronContextMenu && (
      <ChevronContextMenu
        x={chevronContextMenu.x}
        y={chevronContextMenu.y}
        onClose={closeChevronContextMenu}
        onFoldLevel={() => foldLevel(chevronContextMenu.depth)}
        onUnfoldLevel={() => unfoldLevel(chevronContextMenu.depth)}
        onFoldAll={foldAll}
        onUnfoldAll={unfoldAll}
        levelName={chevronContextMenu.fieldName || `Level ${chevronContextMenu.depth + 1}`}
        isExpanded={chevronContextMenu.isOpen}
      />
    )}
  </div>);
});

export default PivotDisplay;
