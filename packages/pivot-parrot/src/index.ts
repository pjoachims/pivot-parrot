/**
 * Pivot Parrot - Clean Architecture Entry Point
 *
 * Architecture layers:
 * - Domain: Pure business logic (no UI dependencies)
 * - Application: Use cases, orchestration, state management
 * - Presentation: React components and UI
 * - Infrastructure: External adapters (data engines, storage)
 */

// ============================================================================
// PRESENTATION LAYER - React Components
// ============================================================================
export { Pivot } from './presentation/pivot/Pivot';
export * from './presentation';

// ============================================================================
// DOMAIN LAYER - Business Logic & Models
// ============================================================================
export { NormalizedPivotConfig } from './domain/models/NormalizedPivotConfig';
export type {
  PivotConfig,
  PivotTableConfig,
  ExtendedPivotTableConfig,
  PivotUISettings,
  PivotEngineSettings,
  PivotCallbacks,
  ValueConfig,
  ValueFormat,
  Filter,
  CustomMetric,
  CustomFilter,
  CustomGrouping,
  PivotView,
  SavedView,
  NewSavedView,
  SnapshotStore
} from './domain/models/types';
export { createMemorySnapshotStore } from './domain/snapshot/memoryStore';

// Export domain layer for advanced usage
export * from './domain';

// ============================================================================
// INFRASTRUCTURE LAYER - Data Engines
// ============================================================================
export * from './infrastructure';

// ============================================================================
// APPLICATION LAYER - Hooks & State
// ============================================================================
export * from './application';

// ============================================================================
// LEGACY EXPORTS (for backwards compatibility - will be deprecated)
// ============================================================================
// Old module structure still exists but not exported here
// Use new layer exports above instead
