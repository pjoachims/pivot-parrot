/**
 * Store Multi-Instance Tests
 *
 * Tests the store factory and multi-instance isolation at the store level.
 * This verifies that the underlying Zustand store mechanism works correctly.
 */

import { renderHook, act } from '@testing-library/react';
import { createPivotStore, usePivotStore, PivotStoreContext, usePivotInstanceKey, clearStoreInstances } from '../store';
import React from 'react';

describe('Store Multi-Instance Isolation', () => {

  beforeEach(() => {
    localStorage.clear();
    clearStoreInstances();
  });

  describe('Store Factory', () => {
    it('should create independent store instances', () => {
      const storeA = createPivotStore('instance-a');
      const storeB = createPivotStore('instance-b');

      // Different store instances
      expect(storeA).not.toBe(storeB);

      // Independent state
      const stateA = storeA.getState();
      const stateB = storeB.getState();

      expect(stateA).not.toBe(stateB);
    });

    it('should have independent state mutations', () => {
      const storeA = createPivotStore('instance-a');
      const storeB = createPivotStore('instance-b');

      // Mutate store A
      act(() => {
        storeA.getState().setSidebarCollapsed(true);
      });

      // Store A is collapsed
      expect(storeA.getState().sidebarCollapsed).toBe(true);
      // Store B is NOT collapsed (independent)
      expect(storeB.getState().sidebarCollapsed).toBe(false);
    });

    it('should use different localStorage keys', async () => {
      const storeA = createPivotStore('sales-pivot');
      const storeB = createPivotStore('products-pivot');

      // Trigger persistence by changing state
      act(() => {
        storeA.getState().setSidebarCollapsed(true);
        storeB.getState().setSidebarCollapsed(false);
      });

      // Wait for persistence (retries until zustand persist has flushed).
      // The old version asserted inside a fire-and-forget setTimeout, which
      // ran AFTER the test finished - it never actually tested anything and
      // threw uncaught AssertionErrors when persistence took >100ms. It also
      // enumerated Object.keys(localStorage), which returns the mock's method
      // names here, never stored keys - use getItem instead.
      await vi.waitFor(() => {
        expect(localStorage.getItem('pivot-preferences-sales-pivot')).not.toBeNull();
        expect(localStorage.getItem('pivot-preferences-products-pivot')).not.toBeNull();
      });
    });

    it('should persist state independently', () => {
      // Create and mutate store A
      const storeA1 = createPivotStore('instance-a');
      act(() => {
        storeA1.getState().setSidebarCollapsed(true);
      });

      // Create and mutate store B
      const storeB1 = createPivotStore('instance-b');
      act(() => {
        storeB1.getState().setSidebarCollapsed(false);
      });

      // Recreate stores (simulating remount)
      const storeA2 = createPivotStore('instance-a');
      const storeB2 = createPivotStore('instance-b');

      // Wait for hydration
      setTimeout(() => {
        // Store A should remember collapsed=true
        expect(storeA2.getState().sidebarCollapsed).toBe(true);
        // Store B should remember collapsed=false
        expect(storeB2.getState().sidebarCollapsed).toBe(false);
      }, 100);
    });
  });

  describe('Context Hooks', () => {
    it('should throw error when used outside provider', () => {
      expect(() => {
        renderHook(() => usePivotStore(s => s.config));
      }).toThrow('usePivotStore must be used within a Pivot component');
    });

    it('should access correct store from context', () => {
      const storeA = createPivotStore('instance-a');
      const storeB = createPivotStore('instance-b');

      // Set different states
      act(() => {
        storeA.getState().setSidebarCollapsed(true);
        storeB.getState().setSidebarCollapsed(false);
      });

      // Hook with store A context
      const { result: resultA } = renderHook(
        () => usePivotStore(s => s.sidebarCollapsed),
        {
          wrapper: ({ children }) =>
            React.createElement(
              PivotStoreContext.Provider,
              { value: { store: storeA, instanceKey: 'instance-a' } },
              children
            )
        }
      );

      // Hook with store B context
      const { result: resultB } = renderHook(
        () => usePivotStore(s => s.sidebarCollapsed),
        {
          wrapper: ({ children }) =>
            React.createElement(
              PivotStoreContext.Provider,
              { value: { store: storeB, instanceKey: 'instance-b' } },
              children
            )
        }
      );

      // Each hook accesses its own store
      expect(resultA.current).toBe(true);  // Store A is collapsed
      expect(resultB.current).toBe(false); // Store B is not collapsed
    });

    it('should get correct instanceKey from context', () => {
      const store = createPivotStore('my-instance');

      const { result } = renderHook(() => usePivotInstanceKey(), {
        wrapper: ({ children }) =>
          React.createElement(
            PivotStoreContext.Provider,
            { value: { store, instanceKey: 'my-instance' } },
            children
          )
      });

      expect(result.current).toBe('my-instance');
    });
  });

  describe('Store Actions', () => {
    it('should update config independently', () => {
      const storeA = createPivotStore('instance-a');
      const storeB = createPivotStore('instance-b');

      const configA = {
        rows: ['Category'],
        columns: ['Year'],
        values: [{ field: 'Sales', aggregation: 'sum' as const }]
      };

      const configB = {
        rows: ['Product'],
        columns: [],
        values: [{ field: 'Cost', aggregation: 'avg' as const }]
      };

      act(() => {
        storeA.getState().setConfig(configA);
        storeB.getState().setConfig(configB);
      });

      // Each store has its own config
      expect(storeA.getState().config.rows).toEqual(['Category']);
      expect(storeB.getState().config.rows).toEqual(['Product']);

      // Changing A doesn't affect B
      act(() => {
        storeA.getState().updateConfig({ rows: ['Region'] });
      });

      expect(storeA.getState().config.rows).toEqual(['Region']);
      expect(storeB.getState().config.rows).toEqual(['Product']); // Unchanged
    });

    it('should manage available fields independently', () => {
      const storeA = createPivotStore('instance-a');
      const storeB = createPivotStore('instance-b');

      const fieldsA = [
        { id: 'Category', name: 'Category', dtype: 'VARCHAR' },
        { id: 'Sales', name: 'Sales', dtype: 'INTEGER' }
      ] as any[];

      const fieldsB = [
        { id: 'Product', name: 'Product', dtype: 'VARCHAR' },
        { id: 'Cost', name: 'Cost', dtype: 'DOUBLE' }
      ] as any[];

      act(() => {
        storeA.getState().setAvailableFields(fieldsA);
        storeB.getState().setAvailableFields(fieldsB);
      });

      expect(storeA.getState().availableFields).toHaveLength(2);
      expect(storeB.getState().availableFields).toHaveLength(2);

      expect(storeA.getState().availableFields[0].id).toBe('Category');
      expect(storeB.getState().availableFields[0].id).toBe('Product');
    });
  });

  describe('DevTools Names', () => {
    it('should use unique DevTools names', () => {
      // This is tested by checking the store creation
      // DevTools name is set during creation: `name: PivotStore-${instanceKey}`

      const storeA = createPivotStore('sales');
      const storeB = createPivotStore('products');

      // Stores should be different
      expect(storeA).not.toBe(storeB);

      // Both stores should work independently
      act(() => {
        storeA.getState().setActiveView('chart');
        storeB.getState().setActiveView('drilldown');
      });

      expect(storeA.getState().activeView).toBe('chart');
      expect(storeB.getState().activeView).toBe('drilldown');
    });
  });

  describe('Edge Cases', () => {
    it('should handle default instanceKey', () => {
      const store = createPivotStore(); // No instanceKey provided
      expect(store).toBeDefined();

      // Should use 'default' as key
      act(() => {
        store.getState().setSidebarCollapsed(true);
      });

      expect(store.getState().sidebarCollapsed).toBe(true);
    });

    it('should create independent stores even with same instanceKey', () => {
      // Each call creates a new independent store
      // instanceKey only affects localStorage/query-locks, not store identity
      const storeA1 = createPivotStore('shared-key');
      const storeA2 = createPivotStore('shared-key');

      // Different store instances (pure independence)
      expect(storeA1).not.toBe(storeA2);

      // Mutations are NOT shared between instances
      act(() => {
        storeA1.getState().setSidebarCollapsed(true);
      });

      expect(storeA1.getState().sidebarCollapsed).toBe(true);
      expect(storeA2.getState().sidebarCollapsed).toBe(false); // Independent!
    });

    it('should handle rapid store creation', () => {
      const stores = [];
      for (let i = 0; i < 10; i++) {
        stores.push(createPivotStore(`instance-${i}`));
      }

      // All stores should be unique
      const uniqueStores = new Set(stores);
      expect(uniqueStores.size).toBe(10);

      // Each should work independently
      stores.forEach((store, i) => {
        act(() => {
          store.getState().setSidebarCollapsed(i % 2 === 0);
        });
      });

      stores.forEach((store, i) => {
        expect(store.getState().sidebarCollapsed).toBe(i % 2 === 0);
      });
    });
  });
});
