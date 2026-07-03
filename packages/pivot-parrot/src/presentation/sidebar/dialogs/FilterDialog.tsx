import React, { useState, useEffect } from 'react';
import Popover from '../shared/Popover';
import { getAvailableFilters, getDefaultFilterType, getFilterCategory } from '../../../application/utils/filterConfig';
import { styles } from './filter-styles';
import { usePivotStore } from '../../../application/state/store';

export function FilterDialog({
  field,
  fieldType,
  onApply,
  onClose,
  existingFilter,
  anchorEl,
  activeFilters = []
}) {
  // Field identification: use id for FieldItem, name for plain objects
  const fieldId = field.id || field.name;
  const fieldDisplayName = field.name || field.id;

  // Read from store
  const uniqueValuesCache = usePivotStore(s => s.uniqueValuesCache);
  const cacheUniqueValues = usePivotStore(s => s.cacheUniqueValues);
  // Get filter configuration based on field type and kind
  const dtypeCategory = getFilterCategory(fieldType, field.kind);
  const filterTypes = getAvailableFilters(fieldType, field.kind);
  const defaultFilterType = getDefaultFilterType(fieldType, field.kind);

  // Categorize filters
  const basicFilters = filterTypes.filter(ft =>
    ['equal', 'contains', 'starts_with', 'ends_with', 'null', 'greater', 'less', 'greater_equal', 'less_equal'].includes(ft.value)
  );
  const hasOneOf = filterTypes.some(ft => ft.value === 'one_of');
  const advancedFilters = filterTypes.filter(ft =>
    ['between', 'regex', 'custom_expr'].includes(ft.value)
  );

  // Determine initial tab based on existing filter
  const getInitialTab = () => {
    if (!existingFilter?.type) return 'basic';
    if (existingFilter.type === 'one_of') return 'one_of';
    // Return actual filter type for advanced filters (between, regex, custom_expr)
    if (['between', 'regex', 'custom_expr'].includes(existingFilter.type)) return existingFilter.type;
    return 'basic';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab());
  const [filterType, setFilterType] = useState(existingFilter?.type || (basicFilters[0]?.value || defaultFilterType));
  const [isNot, setIsNot] = useState(existingFilter?.isNot || false);
  const [showAdvancedDropdown, setShowAdvancedDropdown] = useState(false);
  const [value, setValue] = useState(existingFilter?.value || '');
  const [selectedValues, setSelectedValues] = useState(existingFilter?.selectedValues || []);
  const [loadingValues, setLoadingValues] = useState(false);
  const [betweenStart, setBetweenStart] = useState(existingFilter?.betweenStart || '');
  const [fetchedValues, setFetchedValues] = useState(null); // Local state for fetched values
  const [betweenEnd, setBetweenEnd] = useState(existingFilter?.betweenEnd || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [abortController, setAbortController] = useState(null);
  const [showAllValues, setShowAllValues] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [showFilterSelection, setShowFilterSelection] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [selectedFiltersForFetch, setSelectedFiltersForFetch] = useState(() => {
    const otherFilters = activeFilters.filter(f => f.field !== fieldId);
    return otherFilters.map(f => f.field);
  });

  // Get unique values from cache or local fetched values
  const uniqueValues = fetchedValues || uniqueValuesCache[fieldId] || [];
  const hasCache = !!fetchedValues || !!uniqueValuesCache[fieldId];

  // Get applicable filters
  const applicableFilters = activeFilters.filter(f => f.field !== fieldId);

  // Fetch unique values
  const handleFetchUniqueValues = async () => {
    if (!field.getUniqueValues) {
      return;
    }

    if (applicableFilters.length > 0 && !showFilterSelection) {
      setShowFilterSelection(true);
      return;
    }

    await executeFetch();
  };

  const executeFetch = async () => {
    if (!field.getUniqueValues) return;

    if (abortController) {
      abortController.abort();
    }

    const controller = new AbortController();
    setAbortController(controller);
    setLoadingValues(true);
    setFetchError('');

    try {
      const filtersToApply = applicableFilters.filter(f => selectedFiltersForFetch.includes(f.field));
      const values = await field.getUniqueValues(filtersToApply);

      if (controller.signal.aborted) {
        return;
      }

      const sortedValues = values.sort();

      // Update local state immediately for UI display
      setFetchedValues(sortedValues);

      // Also update store cache for future use
      cacheUniqueValues(fieldId, sortedValues);

      setLoadingValues(false);
      setShowFilterSelection(false);
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error('Failed to load unique values for', fieldDisplayName, ':', err);
        setFetchError(`Failed to load values: ${err.message}`);
        setLoadingValues(false);
      }
    } finally {
      if (controller === abortController) {
        setAbortController(null);
      }
    }
  };

  // Merge unique values with custom selected values
  const allAvailableValues = [...new Set([...selectedValues, ...uniqueValues])];

  const filteredValues = allAvailableValues.filter(v =>
    String(v).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleApply = () => {
    const filter = {
      field: fieldId,
      type: filterType,
      isNot: filterType !== 'between' && isNot,
      value,
      selectedValues,
      betweenStart,
      betweenEnd
    };
    onApply(filter);
    onClose();
  };

  const handleSelectAll = () => {
    setSelectedValues([...allAvailableValues]);
  };

  const handleClearAll = () => {
    setSelectedValues([]);
  };

  const handleToggleValue = (val) => {
    if (selectedValues.includes(val)) {
      setSelectedValues(selectedValues.filter(v => v !== val));
    } else {
      setSelectedValues([...selectedValues, val]);
    }
  };

  const handleAddCustomValue = () => {
    const trimmedValue = customValue.trim();
    if (trimmedValue && !selectedValues.includes(trimmedValue)) {
      setSelectedValues([...selectedValues, trimmedValue]);
      setCustomValue('');
    }
  };

  const handleRemoveValue = (val) => {
    setSelectedValues(selectedValues.filter(v => v !== val));
  };

  const DEFAULT_DISPLAY_LIMIT = 100;
  const MAX_DISPLAY_LIMIT = 1000;
  const currentLimit = showAllValues ? MAX_DISPLAY_LIMIT : DEFAULT_DISPLAY_LIMIT;
  const displayedValues = filteredValues.slice(0, currentLimit);
  const hasMoreValues = filteredValues.length > currentLimit;

  // Get position from anchorEl
  const position = anchorEl ? (() => {
    const rect = anchorEl.getBoundingClientRect();
    return { x: rect.right + 8, y: rect.top };
  })() : null;

  // Handle tab changes
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    // Set appropriate default filter type for the tab
    if (tab === 'basic' && basicFilters.length > 0) {
      setFilterType(basicFilters[0].value);
    } else if (tab === 'one_of') {
      setFilterType('one_of');
    }
  };

  // Helper to format date in local timezone (YYYY-MM-DD)
  const formatLocalDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Quick date filter helpers
  const applyQuickDateFilter = (rangeType) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let start, end;

    switch (rangeType) {
      case 'today':
        start = end = formatLocalDate(today);
        break;
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        start = end = formatLocalDate(yesterday);
        break;
      case 'last7days':
        const last7 = new Date(today);
        last7.setDate(last7.getDate() - 7);
        start = formatLocalDate(last7);
        end = formatLocalDate(today);
        break;
      case 'last30days':
        const last30 = new Date(today);
        last30.setDate(last30.getDate() - 30);
        start = formatLocalDate(last30);
        end = formatLocalDate(today);
        break;
      case 'thisMonth':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        start = formatLocalDate(monthStart);
        end = formatLocalDate(today);
        break;
      case 'lastMonth':
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        start = formatLocalDate(lastMonthStart);
        end = formatLocalDate(lastMonthEnd);
        break;
      case 'thisYear':
        const yearStart = new Date(today.getFullYear(), 0, 1);
        start = formatLocalDate(yearStart);
        end = formatLocalDate(today);
        break;
      case 'lastYear':
        const lastYearStart = new Date(today.getFullYear() - 1, 0, 1);
        const lastYearEnd = new Date(today.getFullYear() - 1, 11, 31);
        start = formatLocalDate(lastYearStart);
        end = formatLocalDate(lastYearEnd);
        break;
      default:
        return;
    }

    setBetweenStart(start);
    setBetweenEnd(end);
    setFilterType('between');
    setActiveTab('between');
  };

  // Render content based on active tab
  const renderFilterContent = () => {
    switch (activeTab) {
      case 'basic':
        return (
          <>
            {/* Quick Date Filters for date/timestamp fields */}
            {(dtypeCategory === 'date' || dtypeCategory === 'timestamp') && (
              <div style={{marginBottom: '12px'}}>
                <label style={{...styles.label, marginBottom: '6px', display: 'block'}}>Quick Filters</label>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px'}}>
                  <button onClick={() => applyQuickDateFilter('today')} style={styles.quickFilterButton}>Today</button>
                  <button onClick={() => applyQuickDateFilter('yesterday')} style={styles.quickFilterButton}>Yesterday</button>
                  <button onClick={() => applyQuickDateFilter('last7days')} style={styles.quickFilterButton}>Last 7 Days</button>
                  <button onClick={() => applyQuickDateFilter('last30days')} style={styles.quickFilterButton}>Last 30 Days</button>
                  <button onClick={() => applyQuickDateFilter('thisMonth')} style={styles.quickFilterButton}>This Month</button>
                  <button onClick={() => applyQuickDateFilter('lastMonth')} style={styles.quickFilterButton}>Last Month</button>
                  <button onClick={() => applyQuickDateFilter('thisYear')} style={styles.quickFilterButton}>This Year</button>
                  <button onClick={() => applyQuickDateFilter('lastYear')} style={styles.quickFilterButton}>Last Year</button>
                </div>
                <div style={{borderTop: '1px solid var(--border-color-light)', margin: '12px 0'}}></div>
              </div>
            )}

            {/* Filter Type Dropdown with IS/IS NOT toggle */}
            <div style={styles.field}>
              <label style={styles.label}>Filter Type</label>
              <div style={{display: 'flex', gap: '6px', alignItems: 'center'}}>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  style={{...styles.select, flex: 1}}
                >
                  {basicFilters.map(ft => (
                    <option key={ft.value} value={ft.value}>
                      {ft.label}
                    </option>
                  ))}
                </select>
                <div style={styles.toggleContainer}>
                  <button
                    onClick={() => setIsNot(false)}
                    style={{
                      ...styles.toggleButton,
                      ...(!isNot ? styles.toggleButtonActive : {})
                    }}
                  >
                    IS
                  </button>
                  <button
                    onClick={() => setIsNot(true)}
                    style={{
                      ...styles.toggleButton,
                      ...(isNot ? styles.toggleButtonActive : {})
                    }}
                  >
                    NOT
                  </button>
                </div>
              </div>
            </div>

            {/* Value Input (not for null) */}
            {filterType !== 'null' && (
              <div style={styles.field}>
                <label style={styles.label}>Value</label>
                <input
                  type={dtypeCategory === 'numeric' ? 'number' : dtypeCategory === 'date' ? 'date' : 'text'}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Enter value"
                  style={styles.input}
                  autoFocus
                />
              </div>
            )}

            {filterType === 'null' && (
              <div style={{fontSize: 'var(--text-xs)', color: 'var(--text-muted)', padding: '8px 0'}}>
                This filter checks for NULL values. No additional input required.
              </div>
            )}
          </>
        );

      case 'between':
        return (
          <div style={styles.betweenContainer}>
            <div style={{flex: 1}}>
              <label style={styles.label}>From</label>
              <input
                type={dtypeCategory === 'numeric' ? 'number' : dtypeCategory === 'date' ? 'date' : 'text'}
                value={betweenStart}
                onChange={(e) => setBetweenStart(e.target.value)}
                style={styles.input}
                placeholder="Start"
                autoFocus
              />
            </div>
            <div style={styles.betweenSeparator}>to</div>
            <div style={{flex: 1}}>
              <label style={styles.label}>To</label>
              <input
                type={dtypeCategory === 'numeric' ? 'number' : dtypeCategory === 'date' ? 'date' : 'text'}
                value={betweenEnd}
                onChange={(e) => setBetweenEnd(e.target.value)}
                style={styles.input}
                placeholder="End"
              />
            </div>
          </div>
        );

      case 'regex':
        return (
          <div style={styles.field}>
            <label style={styles.label}>Regex Pattern</label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter regex pattern"
              style={styles.input}
              autoFocus
            />
          </div>
        );

      case 'custom_expr':
        return (
          <div style={styles.field}>
            <label style={styles.label}>SQL Expression</label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="{{field}} = 'High' OR {{field}} IS NULL"
              style={styles.input}
              autoFocus
            />
            <div style={{fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px'}}>
              <span>Use</span>
              <button
                type="button"
                onClick={() => setValue(value + '{{field}}')}
                style={{
                  background: 'var(--surface-hover)',
                  border: '1px solid var(--border-color-light)',
                  borderRadius: '2px',
                  padding: '1px 4px',
                  fontSize: '9px',
                  cursor: 'pointer',
                  fontFamily: 'monospace'
                }}
              >
                {'{{field}}'}
              </button>
              <span>to reference the grouping</span>
            </div>
          </div>
        );

      case 'one_of':
        return (
          <>
            {fetchError && (
              <div style={{
                background: 'var(--color-error-bg)',
                border: '1px solid var(--color-error-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '5px 8px',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-error)',
                marginBottom: '8px'
              }}>
                {fetchError}
              </div>
            )}

            {/* Filter Selection Panel */}
            {showFilterSelection && applicableFilters.length > 0 && (
              <div style={styles.filterSelectionPanel}>
                <div style={styles.filterSelectionTitle}>Apply filters when fetching:</div>
                <div style={styles.filterSelectionButtons}>
                  <button
                    onClick={() => setSelectedFiltersForFetch(applicableFilters.map(f => f.field))}
                    style={styles.filterSelectionSmallButton}
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => setSelectedFiltersForFetch([])}
                    style={styles.filterSelectionSmallButton}
                  >
                    None
                  </button>
                </div>
                <div style={styles.filterList}>
                  {applicableFilters.map((filter, idx) => (
                    <label key={idx} style={styles.filterItem}>
                      <input
                        type="checkbox"
                        checked={selectedFiltersForFetch.includes(filter.field)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedFiltersForFetch([...selectedFiltersForFetch, filter.field]);
                          } else {
                            setSelectedFiltersForFetch(selectedFiltersForFetch.filter(f => f !== filter.field));
                          }
                        }}
                        style={styles.filterItemCheckbox}
                      />
                      <span>{filter.field} {filter.type && `(${filter.type})`}</span>
                    </label>
                  ))}
                </div>
                <div style={styles.filterSelectionFooter}>
                  <button
                    onClick={executeFetch}
                    disabled={loadingValues}
                    style={{
                      ...styles.customValueButton,
                      ...(loadingValues ? styles.customValueButtonDisabled : {}),
                      flex: 1
                    }}
                  >
                    {loadingValues ? 'Fetching...' : 'Fetch'}
                  </button>
                  <button
                    onClick={() => setShowFilterSelection(false)}
                    style={{...styles.cancelButton, flex: 0}}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Custom Value Input */}
            <div style={styles.field}>
              <label style={styles.label}>Add Custom Value</label>
              <div style={styles.customValueContainer}>
                <input
                  type="text"
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddCustomValue()}
                  placeholder="Type value..."
                  style={styles.customValueInput}
                />
                <button
                  onClick={handleAddCustomValue}
                  disabled={!customValue.trim()}
                  style={{
                    ...styles.customValueButton,
                    ...(!customValue.trim() ? styles.customValueButtonDisabled : {})
                  }}
                >
                  Add
                </button>
              </div>
            </div>

            {/* List Actions */}
            <div style={styles.listActions}>
              <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                <label style={styles.listActionsLabel}>
                  Available Values
                  {selectedValues.length > 0 && (
                    <span style={{color: 'var(--color-accent)', fontSize: '9px', marginLeft: '4px', fontWeight: 600}}>
                      ({selectedValues.length} selected)
                    </span>
                  )}
                  {allAvailableValues.length > 0 && selectedValues.length === 0 && (
                    <span style={{color: 'var(--text-muted)', fontSize: '9px', marginLeft: '4px'}}>
                      ({allAvailableValues.length})
                    </span>
                  )}
                </label>
                {hasCache && (
                  <button
                    onClick={handleFetchUniqueValues}
                    disabled={loadingValues}
                    aria-label="Refetch values"
                    style={{
                      padding: '2px 6px',
                      fontSize: '8px',
                      color: 'var(--text-muted)',
                      background: 'var(--surface-bg)',
                      border: '1px solid var(--border-color-light)',
                      borderRadius: '2px',
                      cursor: loadingValues ? 'not-allowed' : 'pointer'
                    }}
                    title="Refetch values"
                  >
                    ↻
                  </button>
                )}
              </div>
              <div style={styles.listActionsButtons}>
                <button
                  onClick={handleSelectAll}
                  disabled={allAvailableValues.length === 0}
                  style={{
                    ...styles.listActionButton,
                    ...(allAvailableValues.length === 0 ? styles.listActionButtonDisabled : {})
                  }}
                >
                  Select All
                </button>
                <button
                  onClick={handleClearAll}
                  style={styles.listActionButton}
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Search */}
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search..."
              style={styles.searchInput}
            />

            {/* Value List - with selected items at top */}
            <div style={styles.valueListContainer}>
              {filteredValues.length === 0 ? (
                <div style={styles.valueListEmpty}>
                  {hasCache ? (
                    'No values found'
                  ) : (
                    <button
                      onClick={handleFetchUniqueValues}
                      disabled={loadingValues}
                      style={{
                        padding: '6px 12px',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 500,
                        color: 'var(--color-accent)',
                        background: 'var(--surface-bg)',
                        border: '1px solid var(--border-color-medium)',
                        borderRadius: '2px',
                        cursor: loadingValues ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {loadingValues ? 'Fetching...' : 'Fetch Unique Values'}
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Reorder: selected first, then unselected */}
                  {[
                    ...displayedValues.filter(val => selectedValues.includes(val)),
                    ...displayedValues.filter(val => !selectedValues.includes(val))
                  ].map((val, idx) => {
                    const isSelected = selectedValues.includes(val);
                    return (
                      <label
                        key={idx}
                        className={!isSelected ? 'pp-row-hover' : undefined}
                        style={{
                          ...styles.valueListItem,
                          ...(isSelected ? {background: 'var(--color-accent-subtle)', borderBottom: '1px solid var(--border-color-light)'} : {})
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleValue(val)}
                          style={styles.valueListItemCheckbox}
                        />
                        <span style={{...(isSelected ? {fontWeight: 500, color: 'var(--color-accent-chip-text)'} : {})}}>{String(val)}</span>
                      </label>
                    );
                  })}
                  {hasMoreValues && (
                    <div style={styles.moreValuesFooter}>
                      <div>
                        Showing {displayedValues.length} of {filteredValues.length}
                        {searchTerm && ' (filtered)'}
                      </div>
                      {!showAllValues && (
                        <button
                          onClick={() => setShowAllValues(true)}
                          style={styles.showAllButton}
                        >
                          Show All ({Math.min(filteredValues.length, MAX_DISPLAY_LIMIT)})
                        </button>
                      )}
                      {showAllValues && filteredValues.length > MAX_DISPLAY_LIMIT && (
                        <div style={{fontSize: '8px', color: 'var(--text-muted)', marginTop: '2px'}}>
                          Max {MAX_DISPLAY_LIMIT} displayed. Use search.
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <Popover
      title={`Filter: ${fieldDisplayName}`}
      onClose={onClose}
      position={position}
      width={400}
    >
      <div style={styles.container}>
        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            onClick={() => handleTabChange('basic')}
            style={{
              ...styles.tab,
              ...(activeTab === 'basic' ? styles.tabActive : {})
            }}
          >
            Basic
          </button>
          {hasOneOf && (
            <button
              onClick={() => handleTabChange('one_of')}
              style={{
                ...styles.tab,
                ...(activeTab === 'one_of' ? styles.tabActive : {})
              }}
            >
              One Of
            </button>
          )}
          {advancedFilters.length > 0 && (
            <div style={styles.advancedDropdownContainer}>
              <button
                onClick={() => setShowAdvancedDropdown(!showAdvancedDropdown)}
                onBlur={() => setTimeout(() => setShowAdvancedDropdown(false), 150)}
                style={{
                  ...styles.tab,
                  ...(['between', 'regex'].includes(activeTab) ? styles.tabActive : {})
                }}
              >
                Advanced ▾
              </button>
              {showAdvancedDropdown && (
                <div style={styles.advancedDropdown}>
                  {advancedFilters.map(ft => (
                    <button
                      key={ft.value}
                      onClick={() => {
                        setActiveTab(ft.value);
                        setFilterType(ft.value);
                        setShowAdvancedDropdown(false);
                      }}
                      className="pp-menu-item-hover"
                      style={styles.advancedDropdownItem}
                    >
                      {ft.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div style={styles.body}>
          {renderFilterContent()}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button onClick={onClose} style={styles.cancelButton}>
            Cancel
          </button>
          <button onClick={handleApply} style={styles.applyButton}>
            Apply
          </button>
        </div>
      </div>
    </Popover>
  );
}
