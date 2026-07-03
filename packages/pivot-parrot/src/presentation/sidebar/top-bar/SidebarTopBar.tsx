import { useState, useRef } from 'react';
import { usePivotStore } from '../../../application/state/store';
import SQLHistoryEntry from '../snapshots/SQLHistoryEntry';
import BaseDialog from '../../shared/BaseDialog';
import ErrorBanner from '../../shared/ErrorBanner';
import { useClickOutside } from '../../shared/useClickOutside';
import type { FieldItem } from '../../../domain/field/FieldItem';
import type { Snapshot } from '../../../domain/models/types';
import { exportPivot, importPivot } from '../../../domain/pivot/export';

/**
 * SidebarTopBar component
 * Shows collapse toggle, title, auto-update toggle, and settings menu
 */
interface SidebarTopBarProps {
  isRemoteConnection: boolean;
  sqlHistory: any[];
  snapshots?: Snapshot[];
  onSnapshotsImported?: (snapshots: Snapshot[]) => void;
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
      padding: '8px 12px',
      background: 'var(--surface-bg)',
      borderBottom: 'var(--border-width, 1px) solid var(--border-color-medium)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Collapse toggle button */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            style={{
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: 0
            }}
            title="Hide sidebar"
            aria-label="Hide sidebar"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
        <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
          Field Options
        </h2>
        {/* Remote connection indicator */}
        {isRemoteConnection && (
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: 'var(--color-success)',
              boxShadow: '0 0 4px rgba(5, 150, 105, 0.6)'
            }}
            title="Remote connection active"
          />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {/* Auto-update toggle */}
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '11px',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          userSelect: 'none'
        }}>
          <input
            type="checkbox"
            checked={autoUpdate}
            onChange={(e) => onAutoUpdateChange?.(e.target.checked)}
            style={{ width: '12px', height: '12px', cursor: 'pointer' }}
          />
          Auto
        </label>

        {/* Manual update button */}
        {!autoUpdate && (
          <button
            onClick={() => onManualUpdate?.()}
            className="pp-danger-btn-hover"
            style={{
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              background: 'transparent',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              color: 'var(--color-error)',
              fontWeight: 'bold'
            }}
            title="Update pivot"
            aria-label="Update pivot"
          >
            <svg style={{ width: '16px', height: '16px', strokeWidth: 3 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}

        {/* Settings menu icon */}
        <div className="settings-menu-container" style={{ position: 'relative' }}>
          <button
            onClick={() => {
              const next = !showSettingsMenu;
              setShowSettingsMenu(next);
              if (next) setSettingsError('');
            }}
            className="pp-icon-btn-hover"
            style={{
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              background: 'transparent',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              color: 'var(--text-muted)'
            }}
            title="Settings"
            aria-label="Settings"
          >
            <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {/* Settings dropdown menu */}
          {showSettingsMenu && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '4px',
              width: '280px',
              background: 'var(--surface-bg)',
              border: '1px solid var(--border-color-light)',
              borderRadius: '12px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
              zIndex: 'var(--z-dropdown)' as any,
              overflow: 'hidden'
            }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--surface-hover)', background: 'var(--surface-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontWeight: 600, fontSize: '13px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                  Table Settings
                </div>
                <button
                  onClick={() => setShowSettingsMenu(false)}
                  className="pp-icon-btn-muted"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-disabled)', padding: '2px' }}
                  aria-label="Close settings menu"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              {settingsError && (
                <div style={{ padding: '8px 12px 0' }}>
                  <ErrorBanner message={settingsError} onDismiss={() => setSettingsError('')} />
                </div>
              )}

              <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {/* Display Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <h3 style={{ margin: 0, fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Display</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>Subtotals</label>
                      <select
                        value={(config as any)?.subtotals || 'both'}
                        onChange={(e) => setConfig?.({ ...config, subtotals: e.target.value } as any)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ padding: '6px 8px', fontSize: '12px', border: '1px solid var(--border-color-light)', borderRadius: '6px', background: 'var(--surface-subtle)', cursor: 'pointer', color: 'var(--text-secondary)' }}
                      >
                        <option value="both">Both</option>
                        <option value="row">Rows</option>
                        <option value="col">Cols</option>
                        <option value="none">None</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>Grand Totals</label>
                      <select
                        value={(config as any)?.grandTotals || 'both'}
                        onChange={(e) => setConfig?.({ ...config, grandTotals: e.target.value } as any)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ padding: '6px 8px', fontSize: '12px', border: '1px solid var(--border-color-light)', borderRadius: '6px', background: 'var(--surface-subtle)', cursor: 'pointer', color: 'var(--text-secondary)' }}
                      >
                        <option value="both">Both</option>
                        <option value="row">Rows</option>
                        <option value="col">Cols</option>
                        <option value="none">None</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Row Limit</label>
                    <input
                      type="number"
                      value={(config as any)?.uniqueValuesLimit ?? ''}
                      placeholder="Auto"
                      onChange={(e) => {
                        const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                        setConfig?.({ ...config, uniqueValuesLimit: val } as any);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: '80px', padding: '4px 8px', fontSize: '12px', border: '1px solid var(--border-color-light)', borderRadius: '6px', background: 'var(--surface-bg)', textAlign: 'right', color: 'var(--text-secondary)' }}
                      min="1"
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Show Null Groups</label>
                    <input
                      type="checkbox"
                      checked={(config as any)?.showNullGroups !== false}
                      onChange={(e) => setConfig?.({ ...config, showNullGroups: e.target.checked } as any)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--color-accent)' }}
                    />
                  </div>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid var(--surface-hover)', margin: 0 }} />

                {/* Data Source Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <h3 style={{ margin: 0, fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Data Source</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                    {setShowSqlDialog && (
                      <button
                        onClick={() => { setShowSqlDialog(true); setShowSettingsMenu(false); }}
                        className="pp-accent-menu-btn"
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 4px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                        title="View generated SQL"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                        </svg>
                        <span style={{ fontSize: '10px', fontWeight: 500, marginTop: '4px' }}>SQL</span>
                      </button>
                    )}
                    <button
                      onClick={() => { setShowSqlHistory(true); setShowSettingsMenu(false); }}
                      className="pp-accent-menu-btn"
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 4px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                      title="SQL query history"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                      </svg>
                      <span style={{ fontSize: '10px', fontWeight: 500, marginTop: '4px' }}>History</span>
                    </button>
                    <div style={{ padding: '6px 4px' }} />
                    <div style={{ padding: '6px 4px' }} />
                  </div>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid var(--surface-hover)', margin: 0 }} />

                {/* Config Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <h3 style={{ margin: 0, fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Config</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                    <button
                      onClick={handlePasteConfig}
                      className="pp-accent-menu-btn"
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 4px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                      title="Paste config from clipboard"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                      </svg>
                      <span style={{ fontSize: '10px', fontWeight: 500, marginTop: '4px' }}>Paste</span>
                    </button>
                    <button
                      onClick={handleCopyConfig}
                      className="pp-accent-menu-btn"
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 4px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                      title="Copy config to clipboard"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                      </svg>
                      <span style={{ fontSize: '10px', fontWeight: 500, marginTop: '4px' }}>Copy</span>
                    </button>
                    <button
                      onClick={() => configFileInputRef.current?.click()}
                      className="pp-accent-menu-btn"
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 4px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                      title="Load config from file"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
                      </svg>
                      <span style={{ fontSize: '10px', fontWeight: 500, marginTop: '4px' }}>Load</span>
                    </button>
                    <button
                      onClick={handleDownloadConfig}
                      className="pp-accent-menu-btn"
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 4px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                      title="Save config to file"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
                      </svg>
                      <span style={{ fontSize: '10px', fontWeight: 500, marginTop: '4px' }}>Save</span>
                    </button>
                  </div>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid var(--surface-hover)', margin: 0 }} />

                {/* Pivot Import/Export Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <h3 style={{ margin: 0, fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pivot</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="pp-accent-menu-btn"
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 4px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                      title="Import full pivot (.zip)"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      <span style={{ fontSize: '10px', fontWeight: 500, marginTop: '4px' }}>Import</span>
                    </button>
                    <button
                      onClick={handleExportPivot}
                      className="pp-accent-menu-btn"
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 4px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                      title="Export full pivot (.zip)"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                      <span style={{ fontSize: '10px', fontWeight: 500, marginTop: '4px' }}>Export</span>
                    </button>
                    <div style={{ padding: '6px 4px' }} />
                    <div style={{ padding: '6px 4px' }} />
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
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: 'var(--text-base)' }}>
              No SQL queries executed yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {sqlHistory.map((entry, idx) => (
                <SQLHistoryEntry key={idx} entry={entry} index={idx} />
              ))}
            </div>
          )}
        </BaseDialog>
      )}
    </div>
  );
}
