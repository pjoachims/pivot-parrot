export default function DataSource({
  onDataChange,
  onResetToSample,
  onReloadData,
  decimalSeparator,
  onDecimalSeparatorChange,
  dataSource
}) {
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      // Use ArrayBuffer for better memory efficiency
      const arrayBuffer = await file.arrayBuffer();

      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error("No data found in CSV");
      }

      // Pass raw buffer and original file - will be converted in PivotCalculator
      onDataChange(arrayBuffer, null, file.name, file);
    } catch (error) {
      console.error('CSV upload error:', error);
      alert(`Error loading CSV: ${error.message}`);
    }
  };

  // Only show CSV options if user uploaded a file
  const isCustomCSV = dataSource !== 'Sample Data';

  return (
    <div style={styles.container}>
      {/* Left section: File upload */}
      <div style={styles.leftSection}>
        <label style={styles.uploadLabel}>
          <span style={styles.uploadIcon}>📁</span>
          Upload CSV
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            style={styles.fileInput}
          />
        </label>
      </div>

      {/* Right section: Options */}
      <div style={styles.rightSection}>
        {isCustomCSV && (
          <>
            <label style={styles.optionLabel}>
              Decimal:
              <select
                value={decimalSeparator}
                onChange={(e) => onDecimalSeparatorChange(e.target.value)}
                style={styles.select}
              >
                <option value=".">. (period)</option>
                <option value=",">, (comma)</option>
              </select>
            </label>

            <button onClick={onReloadData} style={styles.reloadButton}>
              🔄 Reload
            </button>
          </>
        )}

        <button onClick={onResetToSample} style={styles.sampleButton}>
          📊 Sample Data
        </button>
      </div>
    </div>
  );
}

// Themed entirely via the library's design tokens (pivot-parrot's
// styles.css sets data-theme-aware var() values) - no light/dark branching
// needed here, it just follows document.documentElement's data-theme.
const styles = {
  container: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.75rem 1rem',
    background: 'var(--surface-bg)',
    borderBottom: '1px solid var(--border-color-medium)'
  },
  leftSection: {
    display: 'flex',
    alignItems: 'center'
  },
  uploadLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    background: 'var(--surface-subtle)',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 0,
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--text-primary)',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  uploadIcon: {
    fontSize: '1rem'
  },
  fileInput: {
    display: 'none'
  },
  rightSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem'
  },
  optionLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--text-muted)'
  },
  select: {
    padding: '0.375rem 0.5rem',
    fontSize: '0.875rem',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 0,
    background: 'var(--surface-subtle)',
    color: 'var(--text-primary)',
    cursor: 'pointer'
  },
  reloadButton: {
    padding: '0.5rem 0.875rem',
    background: 'var(--color-accent)',
    color: 'var(--text-inverse)',
    border: 'none',
    borderRadius: 0,
    fontSize: '0.875rem',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  sampleButton: {
    padding: '0.5rem 0.875rem',
    background: 'var(--surface-subtle)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 0,
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background 0.2s'
  }
};
