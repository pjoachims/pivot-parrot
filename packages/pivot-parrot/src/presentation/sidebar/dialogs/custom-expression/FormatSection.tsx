import React from 'react';
import { formatExample } from './validation';
import { usePivotLocale } from '../../../../application/state/store';

/**
 * Format configuration section for custom metrics
 * Allows user to set number format, decimals, currency, and thousand separator
 */
export function FormatSection({ formatType, setFormatType, decimals, setDecimals, currency, setCurrency, useThousandSeparator, setUseThousandSeparator }) {
  const locale = usePivotLocale();
  const id = React.useId();
  return (
    <section className="pp-section" aria-label="Display format">
      <div className="pp-section-title">Display Format</div>

      <div className="pp-row">
        <div className="pp-field" style={{ flex: '2 1 0' }}>
          <label className="pp-label" htmlFor={`${id}-type`}>Type</label>
          <select
            id={`${id}-type`}
            value={formatType}
            onChange={(e) => setFormatType(e.target.value)}
            className="pp-select"
          >
            <option value="auto">Auto (Engine Default)</option>
            <option value="number">Number</option>
            <option value="percentage">Percentage</option>
            <option value="currency">Currency</option>
          </select>
        </div>

        {formatType !== 'auto' && (
          <div className="pp-field">
            <label className="pp-label" htmlFor={`${id}-decimals`}>Decimals</label>
            <input
              id={`${id}-decimals`}
              type="number"
              min="0"
              max="10"
              value={decimals}
              onChange={(e) => setDecimals(e.target.value)}
              className="pp-input"
            />
          </div>
        )}

        {formatType === 'currency' && (
          <div className="pp-field">
            <label className="pp-label" htmlFor={`${id}-currency`}>Currency</label>
            <select
              id={`${id}-currency`}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="pp-select"
            >
              <option value="USD">$ USD</option>
              <option value="EUR">€ EUR</option>
              <option value="GBP">£ GBP</option>
              <option value="JPY">¥ JPY</option>
            </select>
          </div>
        )}
      </div>

      {formatType !== 'auto' && (
        <label className="pp-check">
          <input
            type="checkbox"
            checked={useThousandSeparator}
            onChange={(e) => setUseThousandSeparator(e.target.checked)}
          />
          Thousand separator ({formatExample(1234.56, 'number', 2, currency, true, locale)})
        </label>
      )}

      <div className="pp-readout">
        <span>Preview</span>
        <span>{formatExample(1234.5678, formatType, decimals, currency, useThousandSeparator, locale)}</span>
      </div>
    </section>
  );
}
