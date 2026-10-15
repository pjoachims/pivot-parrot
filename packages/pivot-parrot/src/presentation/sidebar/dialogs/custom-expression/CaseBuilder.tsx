import React from 'react';
import { Icon } from '../../../shared/Icon';

interface CaseCondition {
  when: string;
  then: string;
}

interface CaseBuilderProps {
  conditions: CaseCondition[];
  elseResult: string;
  onChange: (conditions: CaseCondition[], elseResult: string) => void;
}

// When / condition / Then / result / remove: the Else row reuses the grid so
// its input lines up under the conditions.
const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '36px minmax(0, 1fr) 36px 112px var(--control-h-sm)',
  alignItems: 'center',
  columnGap: 'var(--space-2)',
  rowGap: 'var(--space-1)'
};

export function buildCaseSQL(conditions: CaseCondition[], elseResult: string): string {
  const validConditions = conditions.filter(c => c.when.trim() && c.then.trim());
  if (validConditions.length === 0) return '';

  const whenClauses = validConditions.map(c => `  WHEN ${c.when} THEN '${c.then}'`);
  const elseClause = elseResult.trim() ? `\n  ELSE '${elseResult}'` : '';

  return `CASE\n${whenClauses.join('\n')}${elseClause}\nEND`;
}

export function CaseBuilder({ conditions, elseResult, onChange }: CaseBuilderProps) {
  const updateCondition = (index: number, key: 'when' | 'then', value: string) => {
    const updated = [...conditions];
    updated[index] = { ...updated[index], [key]: value };
    onChange(updated, elseResult);
  };

  const addCondition = () => {
    onChange([...conditions, { when: '', then: '' }], elseResult);
  };

  const removeCondition = (index: number) => {
    onChange(conditions.filter((_, i) => i !== index), elseResult);
  };

  return (
    <div style={grid}>
      {conditions.map((c, i) => (
        <React.Fragment key={i}>
          <span className="pp-label">When</span>
          <input
            type="text"
            value={c.when}
            onChange={(e) => updateCondition(i, 'when', e.target.value)}
            placeholder="e.g. sales > 1000"
            aria-label={`Condition ${i + 1}`}
            className="pp-input"
          />
          <span className="pp-label">Then</span>
          <input
            type="text"
            value={c.then}
            onChange={(e) => updateCondition(i, 'then', e.target.value)}
            placeholder="High"
            aria-label={`Result ${i + 1}`}
            className="pp-input"
          />
          {conditions.length > 1 ? (
            <button onClick={() => removeCondition(i)} className="pp-icon-btn pp-icon-btn--danger" aria-label="Remove condition" title="Remove condition">
              <Icon name="x" />
            </button>
          ) : <span />}
        </React.Fragment>
      ))}

      <span />
      <button onClick={addCondition} className="pp-btn pp-btn--quiet pp-btn--sm" style={{ justifySelf: 'start', gridColumn: '2 / 5', paddingLeft: 0 }}>
        <Icon name="plus" />
        Add condition
      </button>
      <span />

      <span className="pp-label">Else</span>
      <input
        type="text"
        value={elseResult}
        onChange={(e) => onChange(conditions, e.target.value)}
        placeholder="default (optional)"
        aria-label="Else result"
        className="pp-input"
        style={{ gridColumn: '2 / 5' }}
      />
      <span />
    </div>
  );
}
