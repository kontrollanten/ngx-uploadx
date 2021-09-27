import { Injectable } from '@angular/core';
const HOUR = 1000 * 60 * 60;

@Injectable()
export class LocalStorageRef {
  constructor() {
    if (LocalStorageRef.isLocalStorageAvailable()) {
      this.localStorageRef = localStorage;
    } else {
      this.localStorageRef = {
        get length(): number {
          return this.map.size;
        },
        clear: () => this.map.clear(),
        getItem: (key: string) => this.map.get(key) || null,
        key: (index: number) => [...this.map.keys()][index],
        removeItem: (key: string) => this.map.delete(key),
        setItem: (key: string, value: string) => this.map.set(key, value)
      };
    }
  }

  get localStorage(): Storage {
    return this.localStorageRef;
  }

  private readonly localStorageRef: Storage;
  private map = new Map<string, string>();

  static isLocalStorageAvailable(): boolean {
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
}

// tslint:disable-next-line:max-classes-per-file
@Injectable()
export class Store<T> {
  prefix = 'UPLOADX-V4-';

  set ttl(maxAgeHours: number) {
    this._ttl = maxAgeHours * HOUR;
    this.purge(maxAgeHours);
  }

  private _ttl = HOUR * 24;

  constructor(private ref: LocalStorageRef) {}

  set(key: string, value: T): void {
    this._ttl &&
      this.ref.localStorage.setItem(
        this.prefix + key,
        JSON.stringify([value, Date.now() + this._ttl])
      );
  }

  get(key: string): T | null {
    const item = this.ref.localStorage.getItem(this.prefix + key);
    if (item) {
      const [value, expires] = JSON.parse(item.trim()) as [T, number];
      return value && Date.now() <= Number(expires) ? value : null;
    }
    return null;
  }

  delete(key: string): void {
    this.ref.localStorage.removeItem(this.prefix + key);
  }

  clear(): void {
    this.keys().forEach(key => this.ref.localStorage.removeItem(key));
  }

  purge(maxAgeHours = 0): void {
    this.keys().forEach(key => {
      const item = this.ref.localStorage.getItem(key);
      if (item && maxAgeHours) {
        const [, expires] = JSON.parse(item.trim());
        if (Date.now() > Number(expires)) {
          this.ref.localStorage.removeItem(key);
        }
      } else {
        this.ref.localStorage.removeItem(key);
      }
    });
  }

  private keys(): string[] {
    return Object.keys(this.ref.localStorage).filter(key => key.indexOf(this.prefix) === 0);
  }
}
