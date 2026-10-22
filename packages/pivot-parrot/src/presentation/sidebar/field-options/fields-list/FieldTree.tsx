import React, { useMemo } from 'react';
import { usePivotStore } from '../../../../application/state/store';
import { FieldItem, inferSemanticType } from '../../../../domain/field/FieldItem';
import { FieldKind, PivotTableConfig, CustomMetric, SIGMA_VALUES_ID } from '../../../../domain/models/types';
import { fieldDisplayName } from '../../../../domain/field/fieldDisplayName';
import { buildFieldTree, matchesSearch, normalizePath, type FieldFolder } from '../../../../domain/field/fieldTree';
import { Icon } from '../../../shared/Icon';
import { AvailableFieldItem } from './AvailableFieldItem';
import { CustomExpressionItem } from './CustomExpressionItem';

type Leaf =
  | { kind: 'field'; field: FieldItem; derived: FieldItem[]; path?: string[] }
  | { kind: 'metric'; metric: CustomMetric; path?: string[] };

interface FieldTreeProps {
  fields: FieldItem[];
  metrics: CustomMetric[];
  searchQuery: string;
  config: PivotTableConfig;
  checkedFields: Set<string>;
  checkedMetrics: Set<string>;
  derivedFieldsMap: Record<string, any[]>;
  detectedTypes: Record<string, string | number>;
  onToggleField: (fieldId: string, checked: boolean) => void;
  onToggleMetric: (metricId: string, checked: boolean) => void;
  onMoveToZone: (id: string, targetZone: string) => void;
  onDragStart: (e: React.DragEvent, id: string, sourceZone: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onRename: (field: FieldItem, anchorEl: HTMLElement) => void;
  onShowDerived: (fieldId: string, event: React.MouseEvent) => void;
  onEditMetric: (metric: CustomMetric) => void;
  onDeleteMetric: (metric: CustomMetric) => void;
}

const indent = (depth: number) =>
  depth > 0 ? { paddingLeft: `calc(var(--space-2) + ${depth * 16}px)` } : undefined;

/**
 * The base fields and custom metrics as one tree by their `path`: folders
 * collapse (open state kept in the store), a search shows every hit with its
 * folders open. A field without a path sits at the top level, so a list
 * without any path renders flat as before.
 */
export function FieldTree(props: FieldTreeProps) {
  const { fields, metrics, searchQuery, config, checkedFields, checkedMetrics, derivedFieldsMap } = props;
  const openFolders = usePivotStore(s => s.openFolders);
  const toggleFolder = usePivotStore(s => s.toggleFolder);
  const searching = searchQuery.trim() !== '';

  const tree = useMemo(() => {
    const byId = new Map(fields.map(f => [f.id, f]));
    const name = (id: string) => fieldDisplayName(id, config, fields);
    const hit = (id: string, path?: string[]) => matchesSearch(searchQuery, [name(id), id, ...(path ?? [])]);
    const leaves: Leaf[] = [];
    for (const field of fields) {
      if (field.kind === FieldKind.DERIVED_FIELD || field.id === SIGMA_VALUES_ID) continue;
      const derived = (derivedFieldsMap[field.id] || [])
        .map(d => byId.get(typeof d === 'string' ? d : d.id))
        .filter((d): d is FieldItem => !!d);
      const path = normalizePath(field.path);
      if (hit(field.id, path)) {
        leaves.push({ kind: 'field', field, derived, path });
      } else {
        const derivedHits = derived.filter(d => hit(d.id, path));
        if (derivedHits.length) leaves.push({ kind: 'field', field, derived: derivedHits, path });
      }
    }
    for (const metric of metrics) {
      const path = normalizePath(metric.path);
      if (matchesSearch(searchQuery, [metric.name, ...(path ?? [])])) leaves.push({ kind: 'metric', metric, path });
    }
    return buildFieldTree(leaves, l => l.path);
  }, [fields, metrics, searchQuery, config, derivedFieldsMap]);

  const open = useMemo(() => new Set(openFolders), [openFolders]);

  const isUsed = (leaf: Leaf) => leaf.kind === 'metric'
    ? checkedMetrics.has(leaf.metric.id)
    : checkedFields.has(leaf.field.id) || leaf.derived.some(d => checkedFields.has(d.id));
  const holdsUsed = (folder: FieldFolder<Leaf>): boolean =>
    folder.leaves.some(isUsed) || folder.folders.some(holdsUsed);

  const renderLeaf = (leaf: Leaf, depth: number) => {
    if (leaf.kind === 'metric') {
      const { metric } = leaf;
      return (
        <CustomExpressionItem
          key={`metric-${metric.id}`}
          id={metric.id}
          name={metric.name}
          type="metric"
          depth={depth}
          isChecked={checkedMetrics.has(metric.id)}
          onToggle={props.onToggleMetric}
          onMoveToZone={(zone) => props.onMoveToZone(metric.id, zone)}
          onDragStart={props.onDragStart}
          onDragEnd={props.onDragEnd}
          onEdit={() => props.onEditMetric(metric)}
          onDelete={() => props.onDeleteMetric(metric)}
        />
      );
    }
    const { field, derived } = leaf;
    const item = (f: FieldItem, isDerived: boolean) => (
      <AvailableFieldItem
        key={f.id}
        field={f}
        depth={depth}
        isChecked={checkedFields.has(f.id)}
        isDerivedField={isDerived}
        canHaveDerivedFields={!isDerived && inferSemanticType(f.dtype) === 'date'}
        displayName={fieldDisplayName(f.id, config, fields)}
        detectedType={props.detectedTypes[f.id]}
        onToggle={props.onToggleField}
        onMoveToZone={props.onMoveToZone}
        onDragStart={(e, fieldId) => props.onDragStart(e, fieldId, 'list')}
        onDragEnd={props.onDragEnd}
        onRename={isDerived ? undefined : props.onRename}
        onShowDerived={isDerived ? undefined : props.onShowDerived}
      />
    );
    return (
      <React.Fragment key={`field-${field.id}`}>
        {item(field, false)}
        {derived.map(d => item(d, true))}
      </React.Fragment>
    );
  };

  const renderFolder = (folder: FieldFolder<Leaf>): React.ReactNode => {
    const isOpen = searching || open.has(folder.key);
    return (
      <div key={folder.key} role="group" aria-label={folder.name}>
        <button
          type="button"
          className={`pp-folder-row${holdsUsed(folder) ? ' pp-folder-row--used' : ''}`}
          style={indent(folder.depth)}
          aria-expanded={isOpen}
          onClick={() => { if (!searching) toggleFolder(folder.key); }}
        >
          <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} />
          <Icon name={isOpen ? 'folder-open' : 'folder'} />
          <span className="pp-field-row__label">{folder.name}</span>
        </button>
        {isOpen && renderLevel(folder)}
      </div>
    );
  };

  const renderLevel = (folder: FieldFolder<Leaf>) => (
    <>
      {folder.folders.map(renderFolder)}
      {folder.leaves.map(leaf => renderLeaf(leaf, folder.depth + 1))}
    </>
  );

  if (searching && tree.folders.length === 0 && tree.leaves.length === 0) {
    return (
      <div className="pp-hint" style={{ textAlign: 'center', padding: 'var(--space-4) 0' }}>
        No fields matching "{searchQuery}"
      </div>
    );
  }
  return renderLevel(tree);
}

