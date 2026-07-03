import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table';

export default function SimpleGrid({ data, columns }) {
  // Format cell values
  const formatValue = (value, columnId) => {
    if (value === null || value === undefined) return '—';

    // Format numeric values
    if (columnId === 'value' && typeof value === 'number') {
      return value.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      });
    }

    // Hide grouping columns (they're internal)
    if (columnId.startsWith('_grouping_')) {
      return value === 1 ? '✓' : '';
    }

    return String(value);
  };

  // Determine which columns are row index vs values
  const rowIndexCols = ['metric', 'date', 'region', 'category', 'product'];

  // Enhance columns with cell formatters
  const enhancedColumns = columns.map(col => ({
    ...col,
    cell: info => {
      const value = info.getValue();

      // For value columns (not row index), format as numbers
      if (!rowIndexCols.includes(col.id) && typeof value === 'number') {
        return value.toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2
        });
      }

      return formatValue(value, col.id);
    }
  }));

  const table = useReactTable({
    data,
    columns: enhancedColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div style={styles.container}>
      <table style={styles.table}>
        <thead>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th key={header.id} style={styles.th}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map(row => (
            <tr key={row.id} style={styles.tr}>
              {row.getVisibleCells().map((cell, idx) => {
                const isRowIndex = rowIndexCols.includes(cell.column.id);
                const cellStyle = isRowIndex ? {...styles.td, ...styles.rowIndexCell} : styles.td;

                return (
                  <td key={cell.id} style={cellStyle}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const styles = {
  container: {
    overflow: 'auto',
    maxHeight: '600px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.875rem'
  },
  th: {
    padding: '8px 12px',
    textAlign: 'left',
    borderBottom: '2px solid #e5e7eb',
    background: '#f9fafb',
    fontWeight: 600,
    position: 'sticky',
    top: 0,
    zIndex: 1
  },
  tr: {
    borderBottom: '1px solid #f3f4f6'
  },
  td: {
    padding: '8px 12px',
    borderBottom: '1px solid #f3f4f6',
    textAlign: 'right'
  },
  rowIndexCell: {
    background: '#f9fafb',
    fontWeight: 500,
    textAlign: 'left',
    borderRight: '1px solid #e5e7eb'
  }
};
