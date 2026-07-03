import React from 'react';

export default function FormatMenu({
  isVisible,
  onClose,
  onFormatChange,
  currentFormat,
  type = 'value' // 'value' or 'row'
}) {
  if (!isVisible) return null;

  const valueFormats = [
    { value: 'number', label: 'Number (1,234.56)' },
    { value: 'integer', label: 'Integer (1,235)' },
    { value: 'decimal', label: 'Decimal (1234.56)' },
    { value: 'percent', label: 'Percent (12.3%)' },
    { value: 'currency', label: 'Currency ($1,234.56)' },
    { value: 'compact', label: 'Compact (1.2K)' }
  ];

  const rowFormats = [
    { value: '', label: 'Default' },
    { value: 'date:YYYY-MM-DD', label: 'Date (2024-01-15)' },
    { value: 'date:MMM DD, YYYY', label: 'Date (Jan 15, 2024)' },
    { value: 'date:MMMM DD, YYYY', label: 'Date (January 15, 2024)' },
    { value: 'date:MM/DD/YYYY', label: 'Date (01/15/2024)' }
  ];

  const formats = type === 'value' ? valueFormats : rowFormats;

  return (
    <div className="pivot-popover-menu" style={styles.menu}>
      <div style={styles.menuTitle}>Format</div>
      {formats.map(fmt => (
        <div
          key={fmt.value}
          className="pp-menu-item-hover"
          style={{
            ...styles.menuItem,
            ...(currentFormat === fmt.value ? styles.menuItemActive : {})
          }}
          onClick={() => {
            onFormatChange(fmt.value);
            onClose();
          }}
        >
          {fmt.label}
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  menu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 2,
    backgroundColor: 'var(--surface-bg)',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 4,
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    zIndex: 'var(--z-dropdown)' as any,
    minWidth: 180,
    fontSize: 12
  },
  menuTitle: {
    padding: '8px 12px',
    fontWeight: 600,
    borderBottom: '1px solid var(--border-color-light)',
    color: 'var(--text-muted)'
  },
  menuItem: {
    padding: '8px 12px',
    cursor: 'pointer'
  },
  menuItemActive: {
    backgroundColor: 'var(--color-accent-subtle)',
    color: 'var(--color-accent)',
    fontWeight: 500
  }
};
