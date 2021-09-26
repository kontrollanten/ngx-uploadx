class Store {
  prefix = 'UPLOADX^4.2';
  private ttl = 1000 * 60 * 60 * 24;
  private delimiter = ', expires at ';

  set(key: string, value: string): void {
    this.ttl &&
      localStorage.setItem(this.prefix + key, value + this.delimiter + (Date.now() + this.ttl));
  }

  get(key: string): string | null {
    const item = localStorage.getItem(this.prefix + key);
    if (item) {
      const [value, timestamp] = item.split(this.delimiter);
      return value && timestamp ? value : null;
    }
    return null;
  }

  delete(key: string): void {
    localStorage.removeItem(this.prefix + key);
  }

  clear(maxAgeHours = 0): void {
    this.ttl = maxAgeHours * 1000 * 60 * 60;
    this.getAllKeys().forEach(key => {
      const item = localStorage.getItem(this.prefix + key);
      if (item && maxAgeHours) {
        const [, expiresAt] = item.split(this.delimiter);
        if (Date.now() > Number(expiresAt)) {
          localStorage.removeItem(key);
        }
      } else {
        localStorage.removeItem(key);
      }
    });
  }

  private getAllKeys(): string[] {
    return Object.keys(localStorage).filter(key => key.indexOf(this.prefix) === 0);
  }
}

export const store = isLocalStorageAvailable() ? new Store() : new Map<string, string>();

function isLocalStorageAvailable(): boolean {
  try {
    const key = 'uploadxLocalStorageTest';
    const value = 'value';
    localStorage.setItem(key, value);
    const getValue = localStorage.getItem(key);
    localStorage.removeItem(key);
    return getValue === value;
  } catch {
    return false;
  }
}
