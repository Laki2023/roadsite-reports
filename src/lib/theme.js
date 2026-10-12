/* ═══════════════════════════════════════════
   ROADSITE REPORTS — Theme Manager
   Supports: dark | light | system (auto)
   ═══════════════════════════════════════════ */

const STORAGE_KEY = 'roadsite-theme';
const VALID_THEMES = ['dark', 'light', 'system'];

let mediaQuery = null;
let mediaListener = null;

/**
 * Read stored theme preference from localStorage.
 * Returns 'dark' | 'light' | 'system' (defaults to 'system').
 */
export function getStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_THEMES.includes(stored)) return stored;
  } catch (_) {
    // localStorage may be unavailable
  }
  return 'system';
}

/**
 * Apply a theme and persist the choice.
 * @param {'dark'|'light'|'system'} theme
 */
export function setTheme(theme) {
  if (!VALID_THEMES.includes(theme)) theme = 'system';

  // Persist
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (_) {}

  applyTheme(theme);
}

/**
 * Apply theme to the DOM without persisting.
 */
function applyTheme(theme) {
  const root = document.documentElement;

  // Clean up any existing system-mode listener
  if (mediaListener && mediaQuery) {
    mediaQuery.removeEventListener('change', mediaListener);
    mediaListener = null;
  }

  if (theme === 'system') {
    // Remove explicit data-theme — let CSS @media queries handle it
    root.removeAttribute('data-theme');
    // Listen for OS changes so we can dispatch a custom event for React
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaListener = () => {
      // Dispatch event so React components can re-render if needed
      window.dispatchEvent(new CustomEvent('theme-change'));
    };
    mediaQuery.addEventListener('change', mediaListener);
  } else {
    root.setAttribute('data-theme', theme);
  }

  // Dispatch for any listeners
  window.dispatchEvent(new CustomEvent('theme-change'));
}

/**
 * Get the currently resolved (effective) theme: 'dark' or 'light'.
 */
export function getEffectiveTheme() {
  const stored = getStoredTheme();
  if (stored === 'dark' || stored === 'light') return stored;
  // System mode — check OS preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Initialize theme on app load. Call once from entry point.
 */
export function initTheme() {
  const theme = getStoredTheme();
  applyTheme(theme);
}
