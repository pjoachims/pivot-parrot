/**
 * Context menu management hook
 * Consolidates cell and chevron context menu state and handlers
 */

import { useState, useCallback, useEffect } from 'react';
import { buildDrilldownFilters } from '../utils/drilldownBuilder';

interface CellContextMenu {
  x: number;
  y: number;
  cellData: {
    node: any;
    leaf: any;
    value: any;
    rowFields: string[];
    colFields: string[];
  };
}

interface ChevronContextMenu {
  x: number;
  y: number;
  depth: number;
  fieldName: string;
  isOpen: boolean;
}

interface UseContextMenusProps {
  availableFields?: any[];
  derivedFieldsMap?: Record<string, any>;
  config?: any;
  dataEngine?: any;
  onDrilldown?: ((filters: any, sql: string) => void) | null;
  dtypes?: Record<string, string>;
}

export function useContextMenus({
  availableFields = [],
  derivedFieldsMap = {},
  config = {},
  dataEngine,
  onDrilldown,
  dtypes = {}
}: UseContextMenusProps) {
  const [cellContextMenu, setCellContextMenu] = useState<CellContextMenu | null>(null);
  const [chevronContextMenu, setChevronContextMenu] = useState<ChevronContextMenu | null>(null);

  /**
   * Close context menus when clicking outside
   */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const isClickInsideMenu = target.closest('.pivot-context-menu');

      if (!isClickInsideMenu) {
        setCellContextMenu(null);
        setChevronContextMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  /**
   * Handle cell right-click
   */
  const handleCellContextMenu = useCallback((e: React.MouseEvent, cellData: CellContextMenu['cellData']) => {
    e.preventDefault();
    setCellContextMenu({
      x: e.clientX,
      y: e.clientY,
      cellData
    });
  }, []);

  /**
   * Handle chevron right-click
   */
  const handleChevronContextMenu = useCallback((
    e: React.MouseEvent,
    { depth, fieldName, isOpen }: Omit<ChevronContextMenu, 'x' | 'y'>
  ) => {
    e.preventDefault();
    setChevronContextMenu({
      x: e.clientX,
      y: e.clientY,
      depth,
      fieldName,
      isOpen
    });
  }, []);

  /**
   * Handle drilldown action
   */
  const handleDrilldown = useCallback(() => {
    if (!cellContextMenu || !onDrilldown) return;

    const { node, leaf, rowFields, colFields } = cellContextMenu.cellData;
    const dialect = dataEngine?.getDialect();

    const filters = buildDrilldownFilters({
      node,
      leaf,
      rowFields,
      colFields,
      config,
      availableFields,
      derivedFieldsMap,
      dialect,
      dtypes
    });

    onDrilldown(filters, '');
    setCellContextMenu(null);
  }, [cellContextMenu, onDrilldown, availableFields, derivedFieldsMap, config, dataEngine, dtypes]);

  /**
   * Close cell context menu
   */
  const closeCellContextMenu = useCallback(() => {
    setCellContextMenu(null);
  }, []);

  /**
   * Close chevron context menu
   */
  const closeChevronContextMenu = useCallback(() => {
    setChevronContextMenu(null);
  }, []);

  return {
    cellContextMenu,
    chevronContextMenu,
    handleCellContextMenu,
    handleChevronContextMenu,
    handleDrilldown,
    closeCellContextMenu,
    closeChevronContextMenu
  };
}
