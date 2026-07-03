/**
 * Styles for FilterDialog - matching CustomMetricDialog design
 */

export const styles: Record<string, React.CSSProperties> = {
  // Popover content wrapper
  container: {
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '500px'
  },

  // Tabs
  tabs: {
    display: 'flex',
    borderBottom: '1px solid var(--border-color-light)',
    gap: '2px',
    padding: '0 8px',
    background: 'var(--surface-subtle)',
    position: 'relative'
  },
  tab: {
    padding: '6px 10px',
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
    color: 'var(--text-muted)',
    background: 'transparent',
    border: 'none',
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  tabActive: {
    color: 'var(--color-accent)',
    borderBottomColor: 'var(--color-accent)',
    fontWeight: 600
  },

  // Advanced dropdown
  advancedDropdownContainer: {
    position: 'relative'
  },
  advancedDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: '2px',
    background: 'var(--surface-bg)',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    zIndex: 'var(--z-dropdown)' as any,
    minWidth: '120px'
  },
  advancedDropdownItem: {
    padding: '6px 10px',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    background: 'var(--surface-bg)',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    transition: 'background 0.1s ease'
  },

  // Content
  body: {
    padding: '10px',
    overflowY: 'auto',
    flex: 1
  },

  // Form elements
  field: {
    marginBottom: '8px'
  },
  label: {
    display: 'block',
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    marginBottom: '3px'
  },
  input: {
    width: '100%',
    padding: '4px 6px',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    fontFamily: 'inherit'
  },
  select: {
    width: '100%',
    padding: '4px 6px',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    fontFamily: 'inherit',
    backgroundColor: 'var(--surface-bg)',
    cursor: 'pointer'
  },

  // Toggle for IS/IS NOT
  toggleContainer: {
    display: 'inline-flex',
    gap: '0',
    background: 'var(--surface-hover)',
    borderRadius: 'var(--radius-sm)',
    padding: '2px',
    height: '22px'
  },
  toggleButton: {
    padding: '0 8px',
    fontSize: '9px',
    fontWeight: 500,
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    background: 'transparent',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    whiteSpace: 'nowrap'
  },
  toggleButtonActive: {
    background: 'var(--surface-bg)',
    color: 'var(--text-primary)',
    fontWeight: 600,
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
  },

  // Between inputs
  betweenContainer: {
    display: 'flex',
    gap: '6px',
    alignItems: 'flex-end'
  },
  betweenSeparator: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    paddingBottom: '5px'
  },

  // One Of section
  fetchSection: {
    marginBottom: '8px'
  },
  fetchButton: {
    width: '100%',
    padding: '5px 8px',
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
    color: 'var(--color-accent)',
    background: 'var(--surface-bg)',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  fetchButtonDisabled: {
    color: 'var(--text-disabled)',
    cursor: 'not-allowed',
    opacity: 0.6
  },

  // Filter selection panel
  filterSelectionPanel: {
    marginBottom: '8px',
    padding: '8px',
    border: '1px solid var(--border-color-light)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--surface-subtle)'
  },
  filterSelectionTitle: {
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: '6px'
  },
  filterSelectionButtons: {
    display: 'flex',
    gap: '4px',
    marginBottom: '6px'
  },
  filterSelectionSmallButton: {
    padding: '2px 6px',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--surface-bg)',
    fontSize: '9px',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    cursor: 'pointer'
  },
  filterList: {
    maxHeight: '100px',
    overflowY: 'auto',
    marginBottom: '6px'
  },
  filterItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '3px 0',
    fontSize: 'var(--text-xs)',
    cursor: 'pointer'
  },
  filterItemCheckbox: {
    marginRight: '6px',
    cursor: 'pointer'
  },
  filterSelectionFooter: {
    display: 'flex',
    gap: '4px'
  },

  // Custom value input
  customValueContainer: {
    display: 'flex',
    gap: '4px',
    marginBottom: '8px'
  },
  customValueInput: {
    flex: 1,
    padding: '4px 6px',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-xs)'
  },
  customValueButton: {
    padding: '4px 10px',
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
    color: 'var(--text-inverse)',
    background: 'var(--color-accent)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer'
  },
  customValueButtonDisabled: {
    background: 'var(--text-disabled)',
    cursor: 'not-allowed'
  },

  // Selected values pills
  selectedValuesContainer: {
    marginBottom: '8px'
  },
  pillsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    padding: '6px',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    maxHeight: '80px',
    overflowY: 'auto',
    background: 'var(--surface-bg)'
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: '2px 6px',
    background: 'var(--color-accent-chip-bg)',
    border: '1px solid var(--color-accent-chip-border)',
    borderRadius: '10px',
    fontSize: '9px',
    fontWeight: 500,
    color: 'var(--color-accent-chip-text)'
  },
  pillRemove: {
    background: 'none',
    border: 'none',
    color: 'var(--color-accent-chip-text)',
    cursor: 'pointer',
    padding: 0,
    fontSize: '12px',
    lineHeight: '1'
  },

  // Search
  searchInput: {
    width: '100%',
    padding: '4px 6px',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-xs)',
    marginBottom: '6px'
  },

  // Value list
  valueListContainer: {
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    maxHeight: '180px',
    overflowY: 'auto',
    marginBottom: '8px'
  },
  valueListEmpty: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-disabled)',
    textAlign: 'center',
    padding: '16px 8px'
  },
  valueListItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '5px 8px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--surface-hover)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    transition: 'background 0.1s ease'
  },
  valueListItemHover: {
    background: 'var(--surface-subtle)'
  },
  valueListItemCheckbox: {
    marginRight: '6px',
    cursor: 'pointer'
  },

  // More values footer
  moreValuesFooter: {
    fontSize: '9px',
    textAlign: 'center',
    padding: '6px 8px',
    background: 'var(--surface-subtle)',
    borderTop: '1px solid var(--border-color-light)',
    color: 'var(--text-muted)'
  },
  showAllButton: {
    background: 'none',
    border: 'none',
    color: 'var(--color-accent)',
    fontSize: '9px',
    fontWeight: 500,
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: 0,
    marginTop: '3px'
  },

  // List actions
  listActions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px'
  },
  listActionsLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
    color: 'var(--text-secondary)'
  },
  listActionsButtons: {
    display: 'flex',
    gap: '6px'
  },
  listActionButton: {
    background: 'none',
    border: 'none',
    color: 'var(--color-accent)',
    fontSize: '9px',
    fontWeight: 500,
    cursor: 'pointer',
    padding: 0
  },
  listActionButtonDisabled: {
    color: 'var(--border-color-medium)',
    cursor: 'not-allowed'
  },

  // Footer
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '4px',
    padding: '8px 10px',
    borderTop: '1px solid var(--border-color-light)',
    background: 'var(--surface-bg)'
  },
  cancelButton: {
    padding: '4px 10px',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--surface-bg)',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-sm)',
    fontWeight: 500,
    cursor: 'pointer'
  },
  applyButton: {
    padding: '4px 10px',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-accent)',
    color: 'var(--text-inverse)',
    fontSize: 'var(--text-sm)',
    fontWeight: 500,
    cursor: 'pointer'
  },

  // Quick date filter buttons
  quickFilterButton: {
    padding: '5px 8px',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--surface-bg)',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  }
};
