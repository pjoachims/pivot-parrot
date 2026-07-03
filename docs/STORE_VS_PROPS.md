# Store vs Props: Guiding Rules

## Core Principle
**"Data flows down (props), actions flow through store"**

Store = Database | Actions = API endpoints | State = Query results

## When to Use Store

### ✅ Always Use Store For:
- **Actions/setters** - `setConfig()`, `commitConfig()`, `toggleSidebar()` (stable, no re-renders)
- **Truly global UI state** - `sidebarCollapsed`, `locale`, `theme` (many unrelated components need it)
- **Deep leaf components** - Avoids prop drilling hell (5+ levels deep)

### ❌ Don't Use Store When:
- **Parent already has the data** - Don't duplicate subscriptions!
- **Core business logic** - `executionConfig`, `queryResult` should be explicit in function signature
- **Testing matters** - Props are easier to mock than store dependencies

## Decision Tree
1. Does parent already read this from store? → **Use props**
2. Is it core business data (config, results)? → **Use props**
3. Is it UI-only state (collapsed, theme)? → **Store is fine**
4. Would prop drilling be painful (5+ levels)? → **Store is fine**
5. Default → **Use props** (explicit > implicit)

## Examples

**✅ Good - Actions in store:**
```typescript
const setChartConfig = usePivotStore((s) => s.setChartConfig);  // Always fine
```

**✅ Good - Parent has it, pass down:**
```typescript
const chartConfig = usePivotStore((s) => s.chartConfig);  // Query once at top
<Child chartConfig={chartConfig} />  // Pass down
```

**❌ Bad - Duplicate subscriptions:**
```typescript
// Parent
const chartConfig = usePivotStore((s) => s.chartConfig);
// Child ALSO reads it - wasteful!
const chartConfig = usePivotStore((s) => s.chartConfig);
```
