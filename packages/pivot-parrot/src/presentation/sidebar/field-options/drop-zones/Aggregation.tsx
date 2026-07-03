import React from 'react';

// Base Aggregation component
export function Aggregation({ type, field, value, onChange, disabled = false }) {
  const aggregationOptions = [
    { value: 'Sum', label: 'Sum' },
    { value: 'Count', label: 'Count' },
    { value: 'Avg', label: 'Average' },
    { value: 'Max', label: 'Max' },
    { value: 'Min', label: 'Min' }
  ];

  return (
    <select 
      className="w-full px-1 py-0.5 border border-gray-400 text-xs bg-white cursor-move pr-6"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      onMouseDown={(e) => e.stopPropagation()}
      disabled={disabled}
    >
      {aggregationOptions.map(option => (
        <option key={option.value} value={option.value}>
          {option.label} of {field}
        </option>
      ))}
    </select>
  );
}

// Specific aggregation components that extend the base
export function SumAggregation({ field, onChange, disabled }) {
  return (
    <Aggregation 
      type="Sum" 
      field={field} 
      value="Sum" 
      onChange={onChange} 
      disabled={disabled}
    />
  );
}

export function CountAggregation({ field, onChange, disabled }) {
  return (
    <Aggregation 
      type="Count" 
      field={field} 
      value="Count" 
      onChange={onChange} 
      disabled={disabled}
    />
  );
}

export function AvgAggregation({ field, onChange, disabled }) {
  return (
    <Aggregation 
      type="Avg" 
      field={field} 
      value="Avg" 
      onChange={onChange} 
      disabled={disabled}
    />
  );
}

export function MaxAggregation({ field, onChange, disabled }) {
  return (
    <Aggregation 
      type="Max" 
      field={field} 
      value="Max" 
      onChange={onChange} 
      disabled={disabled}
    />
  );
}

export function MinAggregation({ field, onChange, disabled }) {
  return (
    <Aggregation 
      type="Min" 
      field={field} 
      value="Min" 
      onChange={onChange} 
      disabled={disabled}
    />
  );
}

export default Aggregation;