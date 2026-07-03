import React, { useMemo } from 'react';
import { CustomExpressionItem } from './CustomExpressionItem';

interface CustomGroupingsSectionProps {
  customGroupings: any[];
  searchQuery: string;
  checkedGroupings: Set<string>;
  onToggleGrouping: (groupingId: string, checked: boolean) => void;
  onMoveToZone: (groupingId: string, targetZone: string) => void;
  onDragStart: (e: React.DragEvent, groupingId: string, sourceZone: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onEdit: (grouping: any) => void;
  onDelete: (grouping: any) => void;
}

/**
 * CustomGroupingsSection - Renders the custom groupings list
 */
export function CustomGroupingsSection({
  customGroupings,
  searchQuery,
  checkedGroupings,
  onToggleGrouping,
  onMoveToZone,
  onDragStart,
  onDragEnd,
  onEdit,
  onDelete
}: CustomGroupingsSectionProps) {
  // Filter based on search query
  const filteredGroupings = useMemo(() => {
    if (!searchQuery) return customGroupings;
    const lowerQuery = searchQuery.toLowerCase();
    return customGroupings.filter(g => g.name.toLowerCase().includes(lowerQuery));
  }, [customGroupings, searchQuery]);

  return (
    <>
      {filteredGroupings.map((grouping) => (
        <CustomExpressionItem
          key={grouping.id}
          id={grouping.id}
          name={grouping.name}
          type="grouping"
          isChecked={checkedGroupings.has(grouping.id)}
          onToggle={onToggleGrouping}
          onMoveToZone={(targetZone) => onMoveToZone(grouping.id, targetZone)}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onEdit={() => onEdit(grouping)}
          onDelete={() => onDelete(grouping)}
        />
      ))}
    </>
  );
}
