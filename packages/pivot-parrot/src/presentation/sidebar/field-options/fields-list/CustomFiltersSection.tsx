import React, { useMemo } from 'react';
import { CustomExpressionItem } from './CustomExpressionItem';

interface CustomFiltersSectionProps {
  customFilters: any[];
  searchQuery: string;
  checkedFilters: Set<string>;
  onToggleFilter: (filterId: string, checked: boolean) => void;
  onMoveToZone: (filterId: string, targetZone: string) => void;
  onDragStart: (e: React.DragEvent, filterId: string, sourceZone: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onEdit: (filter: any) => void;
  onDelete: (filter: any) => void;
}

/**
 * CustomFiltersSection - Renders the custom filters list
 */
export function CustomFiltersSection({
  customFilters,
  searchQuery,
  checkedFilters,
  onToggleFilter,
  onMoveToZone,
  onDragStart,
  onDragEnd,
  onEdit,
  onDelete
}: CustomFiltersSectionProps) {
  // Filter based on search query
  const filteredFilters = useMemo(() => {
    if (!searchQuery) return customFilters;
    const lowerQuery = searchQuery.toLowerCase();
    return customFilters.filter(f => f.name.toLowerCase().includes(lowerQuery));
  }, [customFilters, searchQuery]);

  return (
    <>
      {filteredFilters.map((filter) => (
        <CustomExpressionItem
          key={filter.id}
          id={filter.id}
          name={filter.name}
          type="filter"
          isChecked={checkedFilters.has(filter.id)}
          onToggle={onToggleFilter}
          onMoveToZone={(targetZone) => onMoveToZone(filter.id, targetZone)}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onEdit={() => onEdit(filter)}
          onDelete={() => onDelete(filter)}
        />
      ))}
    </>
  );
}
