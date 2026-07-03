import { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);

export function RawGridView({ rawSqlData }) {
  // Generate column definitions from data
  const columnDefs = useMemo(() => {
    if (!rawSqlData || rawSqlData.length === 0) return [];

    const firstRow = rawSqlData[0];
    return Object.keys(firstRow).map(key => ({
      field: key,
      headerName: key,
      sortable: true,
      filter: true,
      resizable: true,
      // Auto-size columns
      flex: 1,
      minWidth: 100
    }));
  }, [rawSqlData]);

  const defaultColDef = useMemo(() => ({
    sortable: true,
    filter: true,
    resizable: true,
  }), []);

  if (!rawSqlData || rawSqlData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No data to display
      </div>
    );
  }

  return (
    <div className="ag-theme-alpine" style={{ height: '600px', width: '100%' }}>
      <AgGridReact
        rowData={rawSqlData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        animateRows={true}
        rowSelection="multiple"
        pagination={false}
      />
    </div>
  );
}
