import { useEffect, useState, useRef } from 'react';
import { usePivotStore } from '../../../application/state/store';
import SQLHistoryEntry from '../snapshots/SQLHistoryEntry';
import BaseDialog from '../../shared/BaseDialog';
import { Icon } from '../../shared/Icon';
import ErrorBanner from '../../shared/ErrorBanner';
import { useClickOutside } from '../../shared/useClickOutside';
import type { FieldItem } from '../../../domain/field/FieldItem';
import type { SavedView } from '../../../domain/models/types';
import { exportPivot, importPivot } from '../../../domain/pivot/export';

/**
 * SidebarTopBar component
 * Shows collapse toggle, title, auto-update toggle, and settings menu
 */
interface SidebarTopBarProps {
  isRemoteConnection: boolean;
  sqlHistory: any[];
  snapshots?: SavedView[];
  onSnapshotsImported?: (snapshots: SavedView[]) => void;
  onAutoUpdateChange?: (value: boolean) => void;
  onManualUpdate?: () => void;
  onToggleCollapse?: () => void;
  onFieldsChanged?: (fields: FieldItem[]) => void;
}

export function SidebarTopBar({
  isRemoteConnection,
  sqlHistory,
  snapshots = [],
  onSnapshotsImported,
  onAutoUpdateChange,
  onManualUpdate,
  onToggleCollapse,
  onFieldsChanged
}: SidebarTopBarProps) {
  // Read from store
  const config = usePivotStore(s => s.config);
  const autoUpdate = usePivotStore(s => s.autoUpdate);
  const availableFields = usePivotStore(s => s.availableFields);
  const setConfig = usePivotStore(s => s.setConfig);
  const setShowSqlDialog = usePivotStore(s => s.setShowSqlDialog);

  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [showSqlHistory, setShowSqlHistory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const configFileInputRef = useRef<HTMLInputElement>(null);

  // Close settings menu when clicking outside it
  useClickOutside('.settings-menu-container', () => setShowSettingsMenu(false));
  useEffect(() => {
    if (!showSettingsMenu) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowSettingsMenu(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showSettingsMenu]);

  const handleDownloadConfig = () => {
    if (config) {
      const configExport = {
        config,
        availableFields  // Include all fields (base + derived with metadata)
      };
      const json = JSON.stringify(configExport, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `pivot_config_${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setShowSettingsMenu(false);
    }
  };

  const handlePasteConfig = () => {
    const json = prompt('Paste config JSON:');
    if (json) {
      try {
        const parsed = JSON.parse(json);
        const newConfig = parsed.config || parsed;

        // Restore config
        if (setConfig) {
          setConfig(newConfig);
        }

        // Merge derived fields from saved config with current base fields
        if (parsed.availableFields && onFieldsChanged) {
          const derivedFields = parsed.availableFields.filter(f => f.kind !== 'base_field');
          if (derivedFields.length > 0) {
            onFieldsChanged([...availableFields, ...derivedFields]);
          }
        }

        setShowSettingsMenu(false);
      } catch (error) {
        setSettingsError('Invalid JSON: ' + error.message);
      }
    }
  };

  const handleCopyConfig = async () => {
    if (config) {
      const configExport = { config, availableFields };
      const json = JSON.stringify(configExport, null, 2);
      await navigator.clipboard.writeText(json);
      setShowSettingsMenu(false);
    }
  };

  const handleLoadConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = event.target?.result as string;
        const parsed = JSON.parse(json);
        const newConfig = parsed.config || parsed;

        if (setConfig) {
          setConfig(newConfig);
        }

        if (parsed.availableFields && onFieldsChanged) {
          const derivedFields = parsed.availableFields.filter(f => f.kind !== 'base_field');
          if (derivedFields.length > 0) {
            onFieldsChanged([...availableFields.filter(f => f.kind === 'base_field'), ...derivedFields]);
          }
        }

        setShowSettingsMenu(false);
      } catch (error) {
        setSettingsError('Invalid JSON file: ' + error.message);
      }
    };
    reader.readAsText(file);

    if (configFileInputRef.current) {
      configFileInputRef.current.value = '';
    }
  };

  const handleExportPivot = async () => {
    try {
      const derivedFields = availableFields.filter(f => f.kind !== 'base_field');
      const blob = await exportPivot(config, derivedFields, snapshots);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pivot_export_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setShowSettingsMenu(false);
    } catch (error) {
      setSettingsError('Export failed: ' + error.message);
    }
  };

  const handleImportPivot = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { config: importedConfig, derivedFields, snapshots: importedSnapshots } = await importPivot(file);

      // Restore config
      if (setConfig) {
        setConfig(importedConfig);
      }

      // Merge derived fields with current base fields
      if (derivedFields.length > 0 && onFieldsChanged) {
        onFieldsChanged([...availableFields.filter(f => f.kind === 'base_field'), ...derivedFields]);
      }

      // Restore snapshots
      if (importedSnapshots.length > 0 && onSnapshotsImported) {
        onSnapshotsImported(importedSnapshots);
      }

      setShowSettingsMenu(false);
    } catch (error) {
      setSettingsError('Import failed: ' + error.message);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 'var(--space-2)',
      height: '40px',
      padding: '0 var(--space-2) 0 var(--space-1)',
      background: 'var(--surface-bg)',
      borderBottom: 'var(--border-width, 1px) solid var(--border-color-medium)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', minWidth: 0 }}>
        {onToggleCollapse && (
          <button onClick={onToggleCollapse} className="pp-icon-btn" title="Hide sidebar" aria-label="Hide sidebar">
            <Icon name="chevron-left" />
          </button>
        )}
        <h2 style={{ margin: 0, paddingLeft: onToggleCollapse ? 0 : 'var(--space-2)', fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-primary)' }}>
          Field Options
        </h2>
        {isRemoteConnection && (
          <span
            style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-success)' }}
            title="Remote connection active"
          />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
        <label className="pp-check" style={{ color: 'var(--text-muted)', paddingRight: 'var(--space-1)' }}>
          <input
            type="checkbox"
            checked={autoUpdate}
            onChange={(e) => onAutoUpdateChange?.(e.target.checked)}
          />
          Auto
        </label>

        {/* Pending changes are a state, so this one button carries a color */}
        {!autoUpdate && (
          <button
            onClick={() => onManualUpdate?.()}
            className="pp-icon-btn"
            style={{ color: 'var(--color-warning)' }}
            title="Update pivot"
            aria-label="Update pivot"
          >
            <Icon name="refresh" />
          </button>
        )}

        <div className="settings-menu-container" style={{ position: 'relative' }}>
          <button
            onClick={() => {
              const next = !showSettingsMenu;
              setShowSettingsMenu(next);
              if (next) setSettingsError('');
            }}
            className="pp-icon-btn"
            aria-expanded={showSettingsMenu}
            title="Settings"
            aria-label="Settings"
          >
            <Icon name="settings" />
          </button>

          {showSettingsMenu && (
            <div className="pp-dialog" style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 'var(--space-1)',
              width: '296px',
              zIndex: 'var(--z-dropdown)' as any
            }}>
              <div className="pp-dialog-header">
                <h3 className="pp-dialog-title">Table Settings</h3>
                <button onClick={() => setShowSettingsMenu(false)} className="pp-icon-btn" aria-label="Close settings menu">
                  <Icon name="x" />
                </button>
              </div>

              <div className="pp-dialog-body">
                {settingsError && (
                  <ErrorBanner message={settingsError} onDismiss={() => setSettingsError('')} />
                )}

                <div className="pp-stack" style={{ gap: 'var(--space-2)' }}>
                  <div className="pp-section-title">Display</div>
                  <div className="pp-row">
                    <div className="pp-field">
                      <label className="pp-label">Subtotals</label>
                      <select
                        value={(config as any)?.subtotals || 'both'}
                        onChange={(e) => setConfig?.({ ...config, subtotals: e.target.value } as any)}
                        onClick={(e) => e.stopPropagation()}
                        className="pp-select"
                      >
                        <option value="both">Both</option>
                        <option value="row">Rows</option>
                        <option value="col">Cols</option>
                        <option value="none">None</option>
                      </select>
                    </div>
                    <div className="pp-field">
                      <label className="pp-label">Grand Totals</label>
                      <select
                        value={(config as any)?.grandTotals || 'both'}
                        onChange={(e) => setConfig?.({ ...config, grandTotals: e.target.value } as any)}
                        onClick={(e) => e.stopPropagation()}
                        className="pp-select"
                      >
                        <option value="both">Both</option>
                        <option value="row">Rows</option>
                        <option value="col">Cols</option>
                        <option value="none">None</option>
                      </select>
                    </div>
                  </div>
                  <div className="pp-label-row">
                    <span className="pp-label">Row Limit</span>
                    <input
                      aria-label="Row Limit"
                      type="number"
                      value={(config as any)?.uniqueValuesLimit ?? ''}
                      placeholder="Auto"
                      onChange={(e) => {
                        const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                        setConfig?.({ ...config, uniqueValuesLimit: val } as any);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="pp-input"
                      style={{ width: '88px', textAlign: 'right' }}
                      min="1"
                    />
                  </div>
                  <label className="pp-check" style={{ justifyContent: 'space-between', flexDirection: 'row-reverse' }}>
                    <input
                      type="checkbox"
                      checked={(config as any)?.showNullGroups !== false}
                      onChange={(e) => setConfig?.({ ...config, showNullGroups: e.target.checked } as any)}
                    />
                    Show Null Groups
                  </label>
                </div>

                <div className="pp-section">
                  <div className="pp-section-title">Data Source</div>
                  <div style={tileGrid}>
                    {setShowSqlDialog && (
                        <button onClick={() => { setShowSqlDialog(true); setShowSettingsMenu(false); }} className="pp-btn pp-btn--quiet" style={tileStyle} title="View generated SQL">
                        <Icon name="database" />
                        SQL
                      </button>
                    )}
                      <button onClick={() => { setShowSqlHistory(true); setShowSettingsMenu(false); }} className="pp-btn pp-btn--quiet" style={tileStyle} title="SQL query history">
                        <Icon name="history" />
                        History
                      </button>
                  </div>
                </div>

                <div className="pp-section">
                  <div className="pp-section-title">Config</div>
                  <div style={tileGrid}>
                      <button onClick={handlePasteConfig} className="pp-btn pp-btn--quiet" style={tileStyle} title="Paste config from clipboard">
                        <Icon name="clipboard" />
                        Paste
                      </button>
                      <button onClick={handleCopyConfig} className="pp-btn pp-btn--quiet" style={tileStyle} title="Copy config to clipboard">
                        <Icon name="copy" />
                        Copy
                      </button>
                      <button onClick={() => configFileInputRef.current?.click()} className="pp-btn pp-btn--quiet" style={tileStyle} title="Load config from file">
                        <Icon name="file-plus" />
                        Load
                      </button>
                      <button onClick={handleDownloadConfig} className="pp-btn pp-btn--quiet" style={tileStyle} title="Save config to file">
                        <Icon name="save" />
                        Save
                      </button>
                  </div>
                </div>

                <div className="pp-section">
                  <div className="pp-section-title">Pivot</div>
                  <div style={tileGrid}>
                      <button onClick={() => fileInputRef.current?.click()} className="pp-btn pp-btn--quiet" style={tileStyle} title="Import full pivot (.zip)">
                        <Icon name="upload" />
                        Import
                      </button>
                      <button onClick={handleExportPivot} className="pp-btn pp-btn--quiet" style={tileStyle} title="Export full pivot (.zip)">
                        <Icon name="download" />
                        Export
                      </button>
                  </div>
                </div>
              </div>

              <input ref={fileInputRef} type="file" accept=".zip" onChange={handleImportPivot} style={{ display: 'none' }} />
              <input ref={configFileInputRef} type="file" accept=".json" onChange={handleLoadConfig} style={{ display: 'none' }} />
            </div>
          )}
        </div>
      </div>

      {/* SQL History Dialog */}
      {showSqlHistory && (
        <BaseDialog
          title={`SQL History (${sqlHistory.length})`}
          onClose={() => setShowSqlHistory(false)}
          showFooter={false}
          maxWidth="800px"
        >
          {sqlHistory.length === 0 ? (
            <div className="pp-hint" style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
              No SQL queries executed yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {sqlHistory.map((entry, idx) => (
                <SQLHistoryEntry key={idx} entry={entry} />
              ))}
            </div>
          )}
        </BaseDialog>
      )}
    </div>
  );
}

// Four equal icon-over-label tiles per settings row
const tileGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 'var(--space-1)'
};

const tileStyle: React.CSSProperties = {
  flexDirection: 'column',
  gap: 'var(--space-1)',
  height: '48px',
  padding: 0,
  fontSize: 'var(--text-xs)'
};
