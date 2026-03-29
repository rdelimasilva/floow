# Deferred Items — Phase 07

## Out-of-scope discoveries (not fixed, tracked for future)

### sidebar.tsx exceeds 500-line CLAUDE.md limit (pre-existing)

- **File:** apps/web/components/layout/sidebar.tsx
- **Lines:** 517 (after 07-02 Task 2 changes)
- **Status:** Pre-existing violation — file was 515 lines before this plan
- **Note:** Only 2 lines were added (one import + one nav item). Refactoring the sidebar to split into sub-components is a future task.
- **Suggested action:** Split UserMenu, NavLink, and NAV_SECTIONS into separate files in a future maintenance plan.
