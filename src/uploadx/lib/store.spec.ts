import { store } from './store';

describe('store', () => {
  it('string', () => {
    store.set('k', 'v');
    expect(store.get('k')).toBe('v');
  });

  it('clear(ttl)', () => {
    store.purge(1);
    store.set('k', 'v');
    store.purge(1);
    expect(store.get('k')).toBe('v');
  });

  it('clear(0)', () => {
    store.purge();
    store.set('k', 'v');
    store.purge();
    expect(store.get('k')).toBeNull();
  });

  it('object', () => {
    store.purge(1);
    // tslint:disable-next-line:no-any
    store.set('k', { a: 1, b: 2 } as any);
    expect(store.get('k')).toEqual(jasmine.objectContaining({ a: 1, b: 2 }));
  });
});
