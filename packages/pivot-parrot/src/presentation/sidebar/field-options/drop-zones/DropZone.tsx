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
  borderClass = "border-gray-200",
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
      className={`p-2 drop-zone ${borderClass} ${isDragOver ? 'drag-over' : ''} ${className}`}
      style={{ padding: '8px', ...borderStyle }}
      data-dropzone={zone}
      onDragOver={handleZoneDragOver}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop?.(e, zone, insertionIndex ?? childrenArray.length)}
    >
      <div className="flex items-center gap-2 mb-2 text-xs text-gray-700">
        {icon && (
          <span className="inline-flex items-center justify-center w-5 h-5">{icon}</span>
        )}
        <span className="font-semibold">{title}</span>
      </div>
      <div className="space-y-1 relative" style={{ minHeight: '60px', maxHeight: '200px', overflowY: 'auto' }}>
        {isEmpty && (
          <div style={{
            minHeight: '60px',
            background: isDragOver ? 'var(--color-accent-subtle)' : 'var(--surface-subtle)',
            border: isDragOver ? '2px dashed var(--color-accent-hover)' : '1px dashed var(--border-color-medium)',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-disabled)',
            fontSize: '0.75rem',
            fontStyle: 'italic'
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
                <div className="h-1 bg-blue-500 rounded-full opacity-75 -my-0.5"></div>
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
          <div className="h-1 bg-blue-500 rounded-full opacity-75 -my-0.5"></div>
        )}
      </div>
    </div>
  );
}
