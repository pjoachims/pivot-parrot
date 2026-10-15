import React from 'react';

const BEFORE_THRESHOLD = 0.35;
const AFTER_THRESHOLD = 0.65;

export default function DropZone({
  title,
  icon,
  fields = [],
  zone,
  dragOverZone,
  insertionIndex,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
  className = "",
  borderStyle = {},
  isEmpty = false
}) {
  const isDragOver = dragOverZone === zone;

  // Convert children to array to work with insertion
  const childrenArray = React.Children.toArray(children);

  const getInsertionIndexForPosition = (element, clientY, index) => {
    const rect = element.getBoundingClientRect();
    const relativeY = (clientY - rect.top) / rect.height;

    if (relativeY <= BEFORE_THRESHOLD) {
      return index;
    }
    if (relativeY >= AFTER_THRESHOLD) {
      return index + 1;
    }
    return null;
  };

  const handleZoneDragOver = (e) => {
    onDragOver?.(e, zone, childrenArray.length);
  };

  return (
    <div
      className={`drop-zone ${isDragOver ? 'drag-over' : ''} ${className}`}
      style={{ padding: 'var(--space-2) var(--space-2) var(--space-3)', minWidth: 0, ...borderStyle }}
      data-dropzone={zone}
      onDragOver={handleZoneDragOver}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop?.(e, zone, insertionIndex ?? childrenArray.length)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 'var(--control-h-sm)', marginBottom: 'var(--space-1)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-secondary)' }}>
        {icon && <span style={{ display: 'inline-flex', color: 'var(--text-muted)' }}>{icon}</span>}
        <span>{title}</span>
      </div>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minHeight: 'var(--control-h-sm)', maxHeight: '200px', overflowY: 'auto' }}>
        {isEmpty && (
          <div style={{
            height: 'var(--control-h-sm)',
            border: `1px dashed ${isDragOver ? 'var(--color-accent)' : 'var(--border-color-medium)'}`,
            borderRadius: 'var(--radius-sm)',
            background: isDragOver ? 'var(--color-accent-subtle)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-disabled)',
            fontSize: 'var(--text-sm)'
          }}>
            Drop here
          </div>
        )}
        {childrenArray.map((child, index) => {
          if (!React.isValidElement(child)) return null;
          return (
            <React.Fragment key={child.key || index}>
              {/* Insertion indicator before this item */}
              {isDragOver && insertionIndex === index && (
                <div style={insertionLine}></div>
              )}
              {/* Enhanced child with drag over handlers */}
              {React.cloneElement(child, {
              onDragOver: (e) => {
                e.stopPropagation();
                const targetIndex = getInsertionIndexForPosition(e.currentTarget, e.clientY, index);
                if (targetIndex !== null) {
                  onDragOver?.(e, zone, targetIndex);
                  return;
                }

                // Neutral middle band: keep the current insertion target stable if we already have one.
                if (insertionIndex !== null) {
                  onDragOver?.(e, zone, insertionIndex);
                  return;
                }

                const rect = e.currentTarget.getBoundingClientRect();
                const fallbackIndex = e.clientY < rect.top + rect.height / 2 ? index : index + 1;
                onDragOver?.(e, zone, fallbackIndex);
              },
              onDragLeave: (e) => {
                e.stopPropagation();
                // Only trigger parent leave if not moving to another child
                if (!e.currentTarget.contains(e.relatedTarget)) {
                  onDragLeave?.(e);
                }
              },
              onDrop: (e) => {
                e.stopPropagation();
                const targetIndex = getInsertionIndexForPosition(e.currentTarget, e.clientY, index);
                const resolvedIndex = targetIndex ?? insertionIndex;
                if (resolvedIndex !== null && resolvedIndex !== undefined) {
                  onDrop?.(e, zone, resolvedIndex);
                  return;
                }

                const rect = e.currentTarget.getBoundingClientRect();
                const fallbackIndex = e.clientY < rect.top + rect.height / 2 ? index : index + 1;
                onDrop?.(e, zone, fallbackIndex);
              }
            })}
          </React.Fragment>
          );
        })}
        {/* Insertion indicator at the end */}
        {isDragOver && insertionIndex === childrenArray.length && (
          <div style={insertionLine}></div>
        )}
      </div>
    </div>
  );
}

const insertionLine: React.CSSProperties = {
  height: '2px',
  margin: '-3px 0',
  background: 'var(--color-accent)'
};
