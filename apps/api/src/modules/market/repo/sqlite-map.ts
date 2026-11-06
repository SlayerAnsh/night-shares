// Read through on every access so retained collections also observe rollbacks.
export function sqliteMap<T>(deps: {
  read(): Map<string, T>;
  write(key: string, value: T): void;
  remove(key: string): boolean;
  clear(): void;
}): Map<string, T> {
  const map = new Map<string, T>();
  Object.defineProperty(map, "size", { get: () => deps.read().size });
  map.get = (key) => deps.read().get(key);
  map.has = (key) => deps.read().has(key);
  map.keys = () => deps.read().keys();
  map.values = () => deps.read().values();
  map.entries = () => deps.read().entries();
  map[Symbol.iterator] = map.entries;
  map.forEach = (callback, thisArg) => {
    deps.read().forEach((value, key) => {
      callback.call(thisArg, value, key, map);
    });
  };
  map.set = (key, value) => {
    deps.write(key, value);
    return map;
  };
  map.delete = deps.remove;
  map.clear = deps.clear;
  return map;
}
