/**
 * Replaces a global (sessionStorage, localStorage, ...) for one test and puts the original back when it ends.
 * Does what `t.mock.property` does, which only exists from Node 24; this works on Node 22 too.
 */
export function mockGlobal(t, name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true, enumerable: true });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, name, original);
    else delete globalThis[name];
  });
}
