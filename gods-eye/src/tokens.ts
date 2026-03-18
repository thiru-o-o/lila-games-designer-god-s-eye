/**
 * Design tokens — single source of truth for the God's Eye colour palette.
 *
 * Surface levels (dark → light):
 *   SURFACE_1  #0f172a  Sidebar background, dark inner-cards (right pane)
 *   SURFACE_2  #1e293b  Right-pane background, light inner-cards (left pane)
 *
 * Both panes invert which surface they use for their root vs. their cards so
 * that content always appears to "float" above its pane background.
 */

export const SURFACE_1 = '#0f172a';
export const SURFACE_2 = '#1e293b';

export const BORDER         = '#334155';
export const TEXT_PRIMARY   = '#e2e8f0';
export const TEXT_SECONDARY = '#94a3b8';
export const TEXT_TERTIARY  = '#475569';

/** Sky-400 — the single unified interactive accent colour. */
export const ACCENT = '#38bdf8';
