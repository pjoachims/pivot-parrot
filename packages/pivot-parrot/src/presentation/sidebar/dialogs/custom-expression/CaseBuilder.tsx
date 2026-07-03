import React from 'react';

interface CaseCondition {
  when: string;
  then: string;
}

interface CaseBuilderProps {
  conditions: CaseCondition[];
  elseResult: string;
  onChange: (conditions: CaseCondition[], elseResult: string) => void;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  label: {
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
    color: 'var(--text-muted)',
    minWidth: '32px',
  },
  input: {
    padding: '4px 6px',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-xs)',
    flex: 1,
  },
  thenInput: {
    padding: '4px 6px',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-xs)',
    width: '80px',
  },
  removeBtn: {
    padding: '2px 6px',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-disabled)',
    fontSize: '14px',
    cursor: 'pointer',
    lineHeight: 1,
  },
  addBtn: {
    padding: '4px 8px',
    border: '1px dashed var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--surface-bg)',
    color: 'var(--text-muted)',
    fontSize: 'var(--text-xs)',
    cursor: 'pointer',
    marginTop: '2px',
  },
  elseRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginTop: '4px',
    paddingTop: '6px',
    borderTop: '1px solid var(--border-color-light)',
  },
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
    <div style={styles.container}>
      {conditions.map((c, i) => (
        <div key={i} style={styles.row}>
          <span style={styles.label}>When</span>
          <input
            type="text"
            value={c.when}
            onChange={(e) => updateCondition(i, 'when', e.target.value)}
            placeholder="e.g. sales > 1000"
            style={styles.input}
          />
          <span style={styles.label}>Then</span>
          <input
            type="text"
            value={c.then}
            onChange={(e) => updateCondition(i, 'then', e.target.value)}
            placeholder="High"
            style={styles.thenInput}
          />
          {conditions.length > 1 && (
            <button onClick={() => removeCondition(i)} style={styles.removeBtn} aria-label="Remove condition" title="Remove condition">×</button>
          )}
        </div>
      ))}

      <button onClick={addCondition} style={styles.addBtn}>+ Add condition</button>

      <div style={styles.elseRow}>
        <span style={styles.label}>Else</span>
        <input
          type="text"
          value={elseResult}
          onChange={(e) => onChange(conditions, e.target.value)}
          placeholder="default (optional)"
          style={{ ...styles.input, flex: 1 }}
        />
      </div>
    </div>
  );
}
