// Preserve the repository's Map interface while reading current database state.
export function createSqliteMap<T>(storage: {
  keys(): string[];
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): boolean;
}): Map<string, T> {
  const map: Map<string, T> = {
    get size() {
      return storage.keys().length;
    },
    get: storage.get,
    has(key) {
      return storage.get(key) !== undefined;
    },
    set(key, value) {
      storage.set(key, value);
      return map;
    },
    delete: storage.delete,
    clear() {
      for (const key of storage.keys()) storage.delete(key);
    },
    *keys(): MapIterator<string> {
      yield* storage.keys();
    },
    *values(): MapIterator<T> {
      for (const key of storage.keys()) yield storage.get(key) as T;
    },
    *entries(): MapIterator<[string, T]> {
      for (const key of storage.keys())
        yield [key, storage.get(key) as T] as [string, T];
    },
    [Symbol.iterator]() {
      return map.entries();
    },
    [Symbol.toStringTag]: "Map",
    forEach(callback, thisArg) {
      for (const [key, value] of map) callback.call(thisArg, value, key, map);
    },
  };
  return map;
}
