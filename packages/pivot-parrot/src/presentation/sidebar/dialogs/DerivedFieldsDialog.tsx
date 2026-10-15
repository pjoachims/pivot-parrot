import { useState } from 'react';
import Popover from '../shared/Popover';

/**
 * Sanitize a field name to create a valid SQL identifier
 * Removes or replaces characters that are invalid in SQL identifiers
 * Valid characters: letters, digits, underscores
 */
function sanitizeFieldId(fieldName: string): string {
  // Replace invalid characters with underscores
  // Valid: a-z, A-Z, 0-9, _
  return fieldName.replace(/[^a-zA-Z0-9_]/g, '_');
}

export default function DerivedFieldsDialog({ fieldName, displayName, fieldType, existingDerived = [], onClose, onAdd, position, dialect }) {
  const [selected, setSelected] = useState([]);
  const [bucketValue, setBucketValue] = useState(5);
  const [bucketUnit, setBucketUnit] = useState('minutes');

  // Year concatenation toggles
  const [includeYearWeek, setIncludeYearWeek] = useState(true);
  const [includeYearMonth, setIncludeYearMonth] = useState(true);
  const [includeYearQuarter, setIncludeYearQuarter] = useState(true);

  // Format selections
  const [weekFormat, setWeekFormat] = useState('iso'); // 'iso', 'numeric'
  const [monthFormat, setMonthFormat] = useState('numeric'); // 'numeric', 'short', 'full'
  const [quarterFormat, setQuarterFormat] = useState('q'); // 'q', 'numeric'

  const isTimestamp = fieldType === 'timestamp';
  const isDate = fieldType === 'date';

  // Quote the field name for SQL
  const quotedField = dialect.quoteIdentifier(fieldName);

  // Sanitize the field name for use in derived field IDs
  const sanitizedFieldName = sanitizeFieldId(fieldName);

  // Generate date/time part SQL based on dialect
  const dateTimeStrategies = {
    'duckdb': {
      getDatePart: (part) => dialect.getFunction('date_part', part, quotedField),
      getTimePart: (part) => dialect.getFunction('date_part', part, dialect.cast(quotedField, 'timestamp'))
    },
    'databricks': {
      getDatePart: (part) => dialect.getFunction(part, quotedField),
      getTimePart: (part) => dialect.getFunction(part, dialect.cast(quotedField, 'timestamp'))
    },
    'generic': {
      getDatePart: (part) => dialect.getFunction('extract', part, quotedField),
      getTimePart: (part) => dialect.getFunction('extract', part, dialect.cast(quotedField, 'timestamp'))
    }
  };

  const strategy = dateTimeStrategies[dialect.name] || dateTimeStrategies['generic'];

  const dateOptions = [
    { id: 'week', label: 'Week', sql: strategy.getDatePart('week') },
    { id: 'month', label: 'Month', sql: strategy.getDatePart('month') },
    { id: 'quarter', label: 'Quarter', sql: strategy.getDatePart('quarter') },
    { id: 'year', label: 'Year', sql: strategy.getDatePart('year') }
  ];

  const timeOptions = [
    { id: 'hour', label: 'Hour', sql: strategy.getTimePart('hour') },
    { id: 'minute', label: 'Minute', sql: strategy.getTimePart('minute') },
    { id: 'second', label: 'Second', sql: strategy.getTimePart('second') }
  ];

  // Time bucketing for timestamps (use dialect functions)
  const generateTimeBucketSQL = () => {
    const secondsMap = { seconds: 1, minutes: 60, hours: 3600 };
    const totalSeconds = bucketValue * secondsMap[bucketUnit];

    const bucketStrategies = {
      'duckdb': () => {
        const epochExpr = dialect.getFunction('epoch_ms', quotedField);
        const floorExpr = dialect.getFunction('floor', `${epochExpr} / ${totalSeconds * 1000}`);
        return dialect.getFunction('to_timestamp', `${floorExpr} * ${totalSeconds}`);
      },
      'databricks': () => {
        const unixExpr = dialect.getFunction('unix_timestamp', quotedField);
        const floorExpr = dialect.getFunction('floor', `${unixExpr} / ${totalSeconds}`);
        return dialect.getFunction('from_unixtime', `${floorExpr} * ${totalSeconds}`);
      },
      'generic': () => {
        // Use unix_timestamp approach for generic (works in most SQL databases)
        const unixExpr = dialect.getFunction('unix_timestamp', quotedField);
        const floorExpr = dialect.getFunction('floor', `${unixExpr} / ${totalSeconds}`);
        return dialect.getFunction('from_unixtime', `${floorExpr} * ${totalSeconds}`);
      }
    };

    const strategy = bucketStrategies[dialect.name] || bucketStrategies['generic'];
    return strategy();
  };

  // Filter out already created fields
  const availableOptions = dateOptions.filter(
    opt => !existingDerived.includes(`${sanitizedFieldName}_${opt.id}`)
  );

  const toggleOption = (id) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Helper functions using dialect
  const lpad = (expr, len, char) => dialect.getFunction('lpad', expr, len, char);
  const castToString = (expr) => dialect.getFunction('cast_to_string', expr);

  // Generate SQL and label based on format settings
  const generateFieldDefinition = (optionId) => {
    const yearPart = strategy.getDatePart('year');

    if (optionId === 'week') {
      const weekPart = strategy.getDatePart('week');
      if (includeYearWeek) {
        const sql = weekFormat === 'iso'
          ? `${yearPart} || '-CW' || ${lpad(weekPart, 2, '0')}`
          : `${yearPart} || '-' || ${lpad(weekPart, 2, '0')}`;
        return {
          id: `${sanitizedFieldName}_week_year_${weekFormat}`,
          label: `${fieldName} Week`,
          sql,
          derivation_type: 'date_part_formatted'
        };
      } else {
        const sql = weekFormat === 'iso'
          ? `'CW' || ${lpad(weekPart, 2, '0')}`
          : weekPart;
        return {
          id: `${sanitizedFieldName}_week${weekFormat === 'iso' ? '_iso' : ''}`,
          label: `${fieldName} Week`,
          sql,
          derivation_type: weekFormat === 'iso' ? 'date_part_formatted' : 'date_part'
        };
      }
    }

    if (optionId === 'month') {
      const monthPart = strategy.getDatePart('month');
      if (includeYearMonth) {
        let sql;
        if (monthFormat === 'numeric') {
          sql = `${yearPart} || '-' || ${lpad(monthPart, 2, '0')}`;
        } else if (monthFormat === 'short') {
          const monthNames = "['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']";
          sql = `${castToString(yearPart)} || ' ' || ${monthNames}[${monthPart}]`;
        } else { // 'full'
          const monthNames = "['January','February','March','April','May','June','July','August','September','October','November','December']";
          sql = `${castToString(yearPart)} || ' ' || ${monthNames}[${monthPart}]`;
        }
        return {
          id: `${sanitizedFieldName}_month_year_${monthFormat}`,
          label: `${fieldName} Month`,
          sql,
          derivation_type: 'date_part_formatted'
        };
      } else {
        let sql;
        if (monthFormat === 'numeric') {
          sql = monthPart;
        } else if (monthFormat === 'short') {
          const monthNames = "['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']";
          sql = `${monthNames}[${monthPart}]`;
        } else { // 'full'
          const monthNames = "['January','February','March','April','May','June','July','August','September','October','November','December']";
          sql = `${monthNames}[${monthPart}]`;
        }
        return {
          id: `${sanitizedFieldName}_month_${monthFormat}`,
          label: `${fieldName} Month`,
          sql,
          derivation_type: monthFormat === 'numeric' ? 'date_part' : 'date_part_formatted'
        };
      }
    }

    if (optionId === 'quarter') {
      const quarterPart = strategy.getDatePart('quarter');
      if (includeYearQuarter) {
        const sql = quarterFormat === 'q'
          ? `${yearPart} || '-Q' || ${castToString(quarterPart)}`
          : `${yearPart} || '-' || ${castToString(quarterPart)}`;
        return {
          id: `${sanitizedFieldName}_quarter_year_${quarterFormat}`,
          label: `${fieldName} Quarter`,
          sql,
          derivation_type: 'date_part_formatted'
        };
      } else {
        const sql = quarterFormat === 'q'
          ? `'Q' || ${castToString(quarterPart)}`
          : quarterPart;
        return {
          id: `${sanitizedFieldName}_quarter_${quarterFormat}`,
          label: `${fieldName} Quarter`,
          sql,
          derivation_type: quarterFormat === 'q' ? 'date_part_formatted' : 'date_part'
        };
      }
    }

    if (optionId === 'year') {
      return {
        id: `${sanitizedFieldName}_year`,
        label: `${fieldName} Year`,
        sql: yearPart,
        derivation_type: 'date_part'
      };
    }
  };

  const addSelected = () => {
    console.log('[DerivedFieldsDialog] addSelected called', { selected, selectedLength: selected.length });
    if (selected.length === 0) return;
    const fields = selected.map(id => generateFieldDefinition(id));
    console.log('[DerivedFieldsDialog] Calling onAdd with fields:', fields);
    onAdd(fields);
    onClose();
  };

  const addHierarchy = () => {
    const fields = availableOptions.map(opt => generateFieldDefinition(opt.id));
    onAdd(fields);
    onClose();
  };

  const addTimeBucket = () => {
    const fields = [{
      id: `${sanitizedFieldName}_${bucketValue}${bucketUnit}`,
      label: `${fieldName} (${bucketValue} ${bucketUnit})`,  // e.g., "timestamp (5 minutes)"
      sql: generateTimeBucketSQL(),
      derivation_type: 'time_bucket'  // Returns timestamp, needs formatting
    }];
    onAdd(fields);
    onClose();
  };

  // Timestamp: show time bucketing UI
  if (isTimestamp) {
    return (
      <Popover title={`Time Bucket: ${displayName}`} onClose={onClose} position={position} width={280}>
        <div className="pp-dialog-body">
          <div className="pp-row">
            <input
              type="number"
              min="1"
              value={bucketValue}
              onChange={(e) => setBucketValue(Math.max(1, parseInt(e.target.value) || 1))}
              aria-label="Bucket size"
              className="pp-input"
              style={{ width: '64px', flex: '0 0 auto', textAlign: 'right' }}
            />
            <select
              value={bucketUnit}
              onChange={(e) => setBucketUnit(e.target.value)}
              aria-label="Bucket unit"
              className="pp-select"
            >
              <option value="seconds">seconds</option>
              <option value="minutes">minutes</option>
              <option value="hours">hours</option>
            </select>
          </div>
        </div>

        <div className="pp-dialog-footer">
          <button onClick={onClose} className="pp-btn">Cancel</button>
          <button onClick={addTimeBucket} className="pp-btn pp-btn--primary">Add Bucket</button>
        </div>
      </Popover>
    );
  }

  // Date: show year/quarter/month options
  if (availableOptions.length === 0) {
    return (
      <Popover title={`Derived: ${displayName}`} onClose={onClose} position={position} width={280}>
        <div className="pp-dialog-body">
          <p className="pp-hint" style={{ margin: 0 }}>All derived fields already created</p>
        </div>
        <div className="pp-dialog-footer">
          <button onClick={onClose} className="pp-btn">Close</button>
        </div>
      </Popover>
    );
  }

  const renderOption = (option) => {
    const isWeek = option.id === 'week';
    const isMonth = option.id === 'month';
    const isQuarter = option.id === 'quarter';
    const showYearToggle = isWeek || isMonth || isQuarter;
    const showFormat = isWeek || isMonth || isQuarter;

    return (
      <div key={option.id} style={optionRow}>
        <label className="pp-check" style={{ color: 'var(--text-primary)' }}>
          <input
            type="checkbox"
            checked={selected.includes(option.id)}
            onChange={() => toggleOption(option.id)}
          />
          {option.label}
        </label>

        {showYearToggle ? (
          <label className="pp-check">
            <input
              type="checkbox"
              checked={
                isWeek ? includeYearWeek :
                isMonth ? includeYearMonth :
                includeYearQuarter
              }
              onChange={(e) => {
                if (isWeek) setIncludeYearWeek(e.target.checked);
                if (isMonth) setIncludeYearMonth(e.target.checked);
                if (isQuarter) setIncludeYearQuarter(e.target.checked);
              }}
            />
            + Year
          </label>
        ) : <span />}

        {showFormat ? (
          <select
            value={
              isWeek ? weekFormat :
              isMonth ? monthFormat :
              quarterFormat
            }
            onChange={(e) => {
              if (isWeek) setWeekFormat(e.target.value);
              if (isMonth) setMonthFormat(e.target.value);
              if (isQuarter) setQuarterFormat(e.target.value);
            }}
            aria-label={`${option.label} format`}
            className="pp-select pp-select--sm"
          >
            {isWeek && (
              <>
                <option value="iso">CW01</option>
                <option value="numeric">01</option>
              </>
            )}
            {isMonth && (
              <>
                <option value="numeric">01</option>
                <option value="short">Jan</option>
                <option value="full">January</option>
              </>
            )}
            {isQuarter && (
              <>
                <option value="q">Q1</option>
                <option value="numeric">1</option>
              </>
            )}
          </select>
        ) : <span />}
      </div>
    );
  };

  return (
    <Popover title={`Derived: ${displayName}`} onClose={onClose} position={position} width={320}>
      <div className="pp-dialog-body" style={{ gap: 0, paddingTop: 'var(--space-2)', paddingBottom: 'var(--space-2)' }}>
        {availableOptions.map(option => renderOption(option))}
      </div>

      <div className="pp-dialog-footer">
        <button onClick={onClose} className="pp-btn">Cancel</button>
        <button onClick={addHierarchy} className="pp-btn">Add All</button>
        <button onClick={addSelected} disabled={selected.length === 0} className="pp-btn pp-btn--primary">
          Add ({selected.length})
        </button>
      </div>
    </Popover>
  );
}

// Field / +Year / format: fixed columns so the three controls line up across rows
const optionRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 72px 96px',
  alignItems: 'center',
  gap: 'var(--space-2)',
  minHeight: '32px',
  borderBottom: '1px solid var(--border-color-light)'
};
