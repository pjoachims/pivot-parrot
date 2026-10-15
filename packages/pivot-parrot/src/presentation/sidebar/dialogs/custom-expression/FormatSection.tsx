import React from 'react';
import { styles } from './styles';
import { formatExample } from './validation';
import { usePivotLocale } from '../../../../application/state/store';

/**
 * Format configuration section for custom metrics
 * Allows user to set number format, decimals, currency, and thousand separator
 */
export function FormatSection({ formatType, setFormatType, decimals, setDecimals, currency, setCurrency, useThousandSeparator, setUseThousandSeparator }) {
  const locale = usePivotLocale();
  return (
    <div style={styles.formatSection}>
      <div style={styles.formatLabel}>Display Format</div>

      <div style={styles.formatRow}>
        {/* Format Type */}
        <div style={{...styles.field, flex: 1, marginBottom: 0}}>
          <label style={styles.label}>Type</label>
          <select
            value={formatType}
            onChange={(e) => setFormatType(e.target.value)}
            style={styles.select}
          >
            <option value="auto">Auto (Engine Default)</option>
            <option value="number">Number</option>
            <option value="percentage">Percentage</option>
            <option value="currency">Currency</option>
          </select>
        </div>

        {/* Decimal Places (hide when auto) */}
        {formatType !== 'auto' && (
          <div style={{...styles.field, width: '80px', marginBottom: 0}}>
            <label style={styles.label}>Decimals</label>
            <input
              type="number"
              min="0"
              max="10"
              value={decimals}
              onChange={(e) => setDecimals(e.target.value)}
              style={styles.input}
            />
          </div>
        )}

        {/* Currency (only show if formatType is currency) */}
        {formatType === 'currency' && (
          <div style={{...styles.field, width: '90px', marginBottom: 0}}>
            <label style={styles.label}>Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              style={styles.select}
            >
              <option value="USD">$ USD</option>
              <option value="EUR">€ EUR</option>
              <option value="GBP">£ GBP</option>
              <option value="JPY">¥ JPY</option>
            </select>
          </div>
        )}
      </div>

      {/* Thousand Separator (show when not auto) */}
      {formatType !== 'auto' && (
        <div style={{...styles.field, marginTop: '8px', marginBottom: 0}}>
          <label style={{...styles.label, display: 'flex', alignItems: 'center', cursor: 'pointer'}}>
            <input
              type="checkbox"
              checked={useThousandSeparator}
              onChange={(e) => setUseThousandSeparator(e.target.checked)}
              style={{marginRight: '6px', cursor: 'pointer'}}
            />
            Use thousand separator (e.g., {formatExample(1234.56, 'number', 2, currency, true, locale)})
          </label>
        </div>
      )}

      {/* Format Preview */}
      <div style={styles.formatPreview}>
        Preview: {formatExample(1234.5678, formatType, decimals, currency, useThousandSeparator, locale)}
      </div>
    </div>
  );
}
