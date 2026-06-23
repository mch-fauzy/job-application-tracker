// Load .env into process.env so the config singleton and DB-backed tests
// can read DATABASE_URL (Vitest does not load .env on its own).
import 'dotenv/config';
import '@testing-library/jest-dom/vitest';

// jsdom lacks the pointer/observer APIs Radix UI (shadcn DropdownMenu, Dialog) relies on.
// Guarded so node-env tests (where window/Element are undefined) are untouched.
if (typeof window !== 'undefined') {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
