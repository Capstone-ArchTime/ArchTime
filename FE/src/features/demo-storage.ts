export function readDemo<T>(raw: string | null, seed: T, validate: (value: unknown) => value is T): T {
  if (raw === null) return seed;
  const stored = JSON.parse(raw);
  if (stored?.version !== 1 || !validate(stored.data)) throw new Error('Saved demo data cannot be read. Existing data has not been overwritten.');
  return stored.data;
}

export function writeDemo<T>(storage: Storage, key: string, expected: string | null, data: T) {
  if (storage.getItem(key) !== expected) throw new Error('This data changed in another tab. Close the form and try again.');
  storage.setItem(key, JSON.stringify({ version: 1, data }));
}
