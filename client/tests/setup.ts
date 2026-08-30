import "@testing-library/jest-dom";

// Node 22+ ships an experimental built-in `localStorage` global that can shadow jsdom's real
// implementation and lacks a working `.clear()`/`.removeItem()` without a `--localstorage-file`
// flag. Replace it with a simple in-memory Storage-compatible stub so localStorage-backed code
// (e.g. RequesterContext, Issue 2-3) is reliably testable regardless of the Node version running
// the suite.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

Object.defineProperty(window, "localStorage", {
  value: new MemoryStorage(),
  writable: true,
});
