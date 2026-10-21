import React, { useState } from 'react';
import Popover from '../shared/Popover';
import { getAvailableFilters, getDefaultFilterType, getFilterCategory } from '../../../application/utils/filterConfig';
import { Icon } from '../../shared/Icon';
import { usePivotStore } from '../../../application/state/store';
import { RELATIVE_DATE_UNITS, type RelativeDate } from '../../../domain/models/types';
import { relativeDateLabel } from '../../../domain/query/sql/filters';

const RELATIVE_PRESETS: RelativeDate[] = [
  { mode: 'last', n: 1, unit: 'day' },
  { mode: 'previous', n: 1, unit: 'day' },
  { mode: 'last', n: 7, unit: 'day' },
  { mode: 'last', n: 30, unit: 'day' },
  { mode: 'last', n: 1, unit: 'week' },
  { mode: 'previous', n: 1, unit: 'week' },
  { mode: 'last', n: 1, unit: 'month' },
  { mode: 'previous', n: 1, unit: 'month' },
  { mode: 'last', n: 1, unit: 'year' },
];

function IsNotToggle({ isNot, setIsNot }) {
  return (
    <div className="pp-seg" role="group" aria-label="Match">
      <button onClick={() => setIsNot(false)} aria-pressed={!isNot}>IS</button>
      <button onClick={() => setIsNot(true)} aria-pressed={isNot}>NOT</button>
    </div>
  );
}

export function FilterDialog({
  field,
  fieldType,
  onApply,
  onClose,
  existingFilter,
  anchorEl,
  activeFilters = [],
  displayName
}) {
  // Field identification: use id for FieldItem, name for plain objects
  const fieldId = field.id || field.name;

  // Read from store
  const uniqueValuesCache = usePivotStore(s => s.uniqueValuesCache);
  const cacheUniqueValues = usePivotStore(s => s.cacheUniqueValues);
  // Get filter configuration based on field type and kind
  const dtypeCategory = getFilterCategory(fieldType, field.kind);
  const filterTypes = getAvailableFilters(fieldType, field.kind);
  const defaultFilterType = getDefaultFilterType(fieldType, field.kind);
  // Not dtypeCategory: that also files time-of-day types under 'timestamp'.
  const offersRelative = /^(date|timestamp)/.test(fieldType?.name ?? '');

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
    if (existingFilter.type === 'relative_date') return 'relative';
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
  const [fetched, setFetched] = useState(null); // This dialog's own fetch, {values, truncated}
  const [betweenEnd, setBetweenEnd] = useState(existingFilter?.betweenEnd || '');
  const [relative, setRelative] = useState<RelativeDate>(existingFilter?.relative ?? RELATIVE_PRESETS[2]);
  // The count may be empty while it is being retyped.
  const relativeToApply = {...relative, n: Math.max(1, relative.n)};
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
  const shown = fetched || uniqueValuesCache[fieldId];
  const uniqueValues = shown?.values || [];
  const hasCache = !!shown;

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
      const { values, truncated } = await field.getUniqueValues(filtersToApply);

      if (controller.signal.aborted) {
        return;
      }

      const unique = { values: values.sort(), truncated };

      // Update local state immediately for UI display
      setFetched(unique);

      // Also update store cache for future use
      cacheUniqueValues(fieldId, unique);

      setLoadingValues(false);
      setShowFilterSelection(false);
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error('Failed to load unique values for', fieldId, ':', err);
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
    const filter = filterType === 'relative_date' ? {
      field: fieldId,
      type: filterType,
      relative: relativeToApply,
      isNot
    } : {
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
    } else if (tab === 'relative') {
      setFilterType('relative_date');
    }
  };

  // Render content based on active tab
  const renderFilterContent = () => {
    switch (activeTab) {
      case 'basic':
        return (
          <>
            <div className="pp-field">
              <label className="pp-label">Filter Type</label>
              <div className="pp-row">
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="pp-select"
                >
                  {basicFilters.map(ft => (
                    <option key={ft.value} value={ft.value}>
                      {ft.label}
                    </option>
                  ))}
                </select>
                <IsNotToggle isNot={isNot} setIsNot={setIsNot} />
              </div>
            </div>

            {filterType !== 'null' && (
              <div className="pp-field">
                <label className="pp-label">Value</label>
                <input
                  type={dtypeCategory === 'numeric' ? 'number' : dtypeCategory === 'date' ? 'date' : 'text'}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Enter value"
                  className="pp-input"
                  autoFocus
                />
              </div>
            )}

            {filterType === 'null' && (
              <div className="pp-hint">
                This filter checks for NULL values. No additional input required.
              </div>
            )}
          </>
        );

      case 'relative':
        return (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-1)' }}>
              {RELATIVE_PRESETS.map(preset => {
                const label = relativeDateLabel(preset);
                const active = label === relativeDateLabel(relative);
                return (
                  <button
                    key={label}
                    onClick={() => setRelative(preset)}
                    aria-pressed={active}
                    className="pp-btn pp-btn--sm"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="pp-row">
              <select
                aria-label="Mode"
                value={relative.mode}
                onChange={(e) => setRelative({...relative, mode: e.target.value as RelativeDate['mode']})}
                className="pp-select"
                style={{ flex: '1 1 0' }}
              >
                <option value="last">Last</option>
                <option value="previous">Previous</option>
              </select>
              <input
                aria-label="Count"
                type="number"
                min={1}
                step={1}
                value={relative.n || ''}
                onChange={(e) => setRelative({...relative, n: Math.floor(Number(e.target.value)) || 0})}
                className="pp-input"
                style={{ width: '56px', flex: '0 0 auto', textAlign: 'right' }}
              />
              <select
                aria-label="Unit"
                value={relative.unit}
                onChange={(e) => setRelative({...relative, unit: e.target.value as RelativeDate['unit']})}
                className="pp-select"
                style={{ flex: '1 1 0' }}
              >
                {RELATIVE_DATE_UNITS.map(unit => <option key={unit} value={unit}>{unit}s</option>)}
              </select>
              <IsNotToggle isNot={isNot} setIsNot={setIsNot} />
            </div>
            <div className="pp-hint">
              {relativeDateLabel(relativeToApply, isNot)}, counted from the day the query runs. A saved view stays relative.
            </div>
          </>
        );

      case 'between':
        return (
          <div className="pp-row">
            <div className="pp-field">
              <label className="pp-label">From</label>
              <input
                type={dtypeCategory === 'numeric' ? 'number' : dtypeCategory === 'date' ? 'date' : 'text'}
                value={betweenStart}
                onChange={(e) => setBetweenStart(e.target.value)}
                className="pp-input"
                placeholder="Start"
                autoFocus
              />
            </div>
            <div className="pp-field">
              <label className="pp-label">To</label>
              <input
                type={dtypeCategory === 'numeric' ? 'number' : dtypeCategory === 'date' ? 'date' : 'text'}
                value={betweenEnd}
                onChange={(e) => setBetweenEnd(e.target.value)}
                className="pp-input"
                placeholder="End"
              />
            </div>
          </div>
        );

      case 'regex':
        return (
          <div className="pp-field">
            <label className="pp-label">Regex Pattern</label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter regex pattern"
              className="pp-input"
              autoFocus
            />
          </div>
        );

      case 'custom_expr':
        return (
          <div className="pp-field">
            <label className="pp-label">SQL Expression</label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="{{field}} = 'High' OR {{field}} IS NULL"
              className="pp-input"
              autoFocus
            />
            <div className="pp-hint" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
              <span>Use</span>
              <button
                type="button"
                onClick={() => setValue(value + '{{field}}')}
                className="pp-btn pp-btn--sm"
                style={{ height: '20px', padding: '0 6px', fontSize: 'var(--text-xs)' }}
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
              <div className="pp-alert">{fetchError}</div>
            )}

            {showFilterSelection && applicableFilters.length > 0 && (
              <div className="pp-stack" style={{ gap: 'var(--space-2)', padding: 'var(--space-3)', background: 'var(--surface-subtle)', borderRadius: 'var(--radius-sm)' }}>
                <div className="pp-label-row">
                  <span className="pp-label">Apply filters when fetching</span>
                  <span style={{ display: 'flex', gap: 'var(--space-1)' }}>
                    <button
                      onClick={() => setSelectedFiltersForFetch(applicableFilters.map(f => f.field))}
                      className="pp-btn pp-btn--quiet pp-btn--sm"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => setSelectedFiltersForFetch([])}
                      className="pp-btn pp-btn--quiet pp-btn--sm"
                    >
                      None
                    </button>
                  </span>
                </div>
                <div style={{ maxHeight: '100px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                  {applicableFilters.map((filter, idx) => (
                    <label key={idx} className="pp-check">
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
                      />
                      <span>{filter.field} {filter.type && `(${filter.type})`}</span>
                    </label>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                  <button onClick={() => setShowFilterSelection(false)} className="pp-btn pp-btn--sm">
                    Cancel
                  </button>
                  <button onClick={executeFetch} disabled={loadingValues} className="pp-btn pp-btn--sm">
                    {loadingValues ? 'Fetching...' : 'Fetch'}
                  </button>
                </div>
              </div>
            )}

            <div className="pp-field">
              <label className="pp-label">Add Custom Value</label>
              <div className="pp-row">
                <input
                  type="text"
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddCustomValue()}
                  placeholder="Type value..."
                  className="pp-input"
                />
                <button
                  onClick={handleAddCustomValue}
                  disabled={!customValue.trim()}
                  className="pp-btn"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="pp-field">
              <div className="pp-label-row">
                <span className="pp-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                  Available Values
                  {selectedValues.length > 0 && (
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      ({selectedValues.length} selected)
                    </span>
                  )}
                  {allAvailableValues.length > 0 && selectedValues.length === 0 && (
                    <span style={{ color: 'var(--text-muted)' }}>
                      ({allAvailableValues.length})
                    </span>
                  )}
                  {hasCache && (
                    <button
                      onClick={handleFetchUniqueValues}
                      disabled={loadingValues}
                      aria-label="Refetch values"
                      title="Refetch values"
                      className="pp-icon-btn pp-icon-btn--sm"
                    >
                      <Icon name="refresh" />
                    </button>
                  )}
                </span>
                <span style={{ display: 'flex', gap: 'var(--space-1)' }}>
                  <button
                    onClick={handleSelectAll}
                    disabled={allAvailableValues.length === 0}
                    className="pp-btn pp-btn--quiet pp-btn--sm"
                  >
                    Select All
                  </button>
                  <button onClick={handleClearAll} className="pp-btn pp-btn--quiet pp-btn--sm">
                    Clear
                  </button>
                </span>
              </div>

              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search..."
                className="pp-input"
              />
              {shown?.truncated && (
                <div className="pp-hint">
                  Only the first {uniqueValues.length} values were fetched, and search looks only at these.
                  Add a missing value above, or narrow the fetch with other filters.
                </div>
              )}

              <div style={valueListStyle}>
                {filteredValues.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '96px', padding: 'var(--space-2)' }} className="pp-hint">
                    {hasCache ? (
                      'No values found'
                    ) : (
                      <button onClick={handleFetchUniqueValues} disabled={loadingValues} className="pp-btn">
                        {loadingValues ? 'Fetching...' : 'Fetch Unique Values'}
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {[
                      ...displayedValues.filter(val => selectedValues.includes(val)),
                      ...displayedValues.filter(val => !selectedValues.includes(val))
                    ].map((val, idx) => {
                      const isSelected = selectedValues.includes(val);
                      return (
                        <label
                          key={idx}
                          className={`pp-check${isSelected ? '' : ' pp-row-hover'}`}
                          style={{
                            display: 'flex',
                            minHeight: 'var(--control-h-sm)',
                            padding: '0 var(--space-2)',
                            borderBottom: '1px solid var(--border-color-light)',
                            color: 'var(--text-primary)',
                            ...(isSelected ? { background: 'var(--color-accent-subtle)' } : {})
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleValue(val)}
                          />
                          <span className="pp-truncate" style={isSelected ? { fontWeight: 600 } : undefined}>{String(val)}</span>
                        </label>
                      );
                    })}
                    {hasMoreValues && (
                      <div className="pp-hint" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', padding: 'var(--space-1) var(--space-2)', background: 'var(--surface-subtle)' }}>
                        <span>
                          Showing {displayedValues.length} of {filteredValues.length}
                          {searchTerm && ' (filtered)'}
                        </span>
                        {!showAllValues && (
                          <button onClick={() => setShowAllValues(true)} className="pp-btn pp-btn--quiet pp-btn--sm">
                            Show All ({Math.min(filteredValues.length, MAX_DISPLAY_LIMIT)})
                          </button>
                        )}
                        {showAllValues && filteredValues.length > MAX_DISPLAY_LIMIT && (
                          <span>Max {MAX_DISPLAY_LIMIT} displayed. Use search.</span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  const advancedActive = ['between', 'regex'].includes(activeTab);

  return (
    <Popover
      title={`Filter: ${displayName}`}
      onClose={onClose}
      position={position}
      width={400}
    >
      <div className="pp-tabs" role="tablist">
        <button role="tab" aria-selected={activeTab === 'basic'} onClick={() => handleTabChange('basic')} className="pp-tab">
          Basic
        </button>
        {offersRelative && (
          <button role="tab" aria-selected={activeTab === 'relative'} onClick={() => handleTabChange('relative')} className="pp-tab">
            Relative
          </button>
        )}
        {hasOneOf && (
          <button role="tab" aria-selected={activeTab === 'one_of'} onClick={() => handleTabChange('one_of')} className="pp-tab">
            One Of
          </button>
        )}
        {advancedFilters.length > 0 && (
          <div style={{ position: 'relative', display: 'flex' }}>
            <button
              role="tab"
              aria-selected={advancedActive}
              aria-haspopup="menu"
              aria-expanded={showAdvancedDropdown}
              onClick={() => setShowAdvancedDropdown(!showAdvancedDropdown)}
              onBlur={() => setTimeout(() => setShowAdvancedDropdown(false), 150)}
              className="pp-tab"
            >
              Advanced
              <Icon name="chevron-down" />
            </button>
            {showAdvancedDropdown && (
              <div className="pp-menu" role="menu" style={{ position: 'absolute', top: '100%', left: 0, marginTop: '2px', zIndex: 'var(--z-dropdown)' as any }}>
                {advancedFilters.map(ft => (
                  <button
                    key={ft.value}
                    role="menuitemradio"
                    aria-checked={activeTab === ft.value}
                    onClick={() => {
                      setActiveTab(ft.value);
                      setFilterType(ft.value);
                      setShowAdvancedDropdown(false);
                    }}
                    className="pp-menu-item"
                  >
                    {ft.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="pp-dialog-body">
        {renderFilterContent()}
      </div>

      <div className="pp-dialog-footer">
        <button onClick={onClose} className="pp-btn">
          Cancel
        </button>
        <button onClick={handleApply} className="pp-btn pp-btn--primary">
          Apply
        </button>
      </div>
    </Popover>
  );
}

const valueListStyle: React.CSSProperties = {
  border: '1px solid var(--border-color-medium)',
  borderRadius: 'var(--radius-sm)',
  maxHeight: '200px',
  overflowY: 'auto'
};
