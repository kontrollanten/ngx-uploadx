import { b64, isNumber, resolveUrl, unfunc } from './utils';

/* eslint-disable @typescript-eslint/no-explicit-any */

const urlTestData = [
  ['https://a/b/c', 'https://d/e/f?g=1', 'https://d/e/f?g=1'],
  ['http://a/b/c', 'https://d/e/f?g=2', 'https://d/e/f?g=2'],
  ['https://a/b/c', '//d/e/f?g=3', 'https://d/e/f?g=3'],
  ['http://a/b/c', '//d/e/f?g=4', 'http://d/e/f?g=4'],
  ['https://a/b/c', '/d/e?f=5', 'https://a/d/e?f=5'],
  ['https://a/b/c', 'd/e?f=6', 'https://a/b/d/e?f=6'],
  ['/b/c', '//d/e/f?g=7', '//d/e/f?g=7'],
  ['/b/c', '/d/e?f=8', '/d/e?f=8'],
  ['/b/c', 'd/e?f=9', '/b/d/e?f=9']
];
describe('resolveUrl', () => {
  it('resolveUrl', () => {
    urlTestData.forEach(([base, url, expected]) => {
      expect(resolveUrl(url, base)).toBe(expected);
    });
  });
});

describe('b64', () => {
  const data = {
    name: 'спутник.mp4',
    lastModified: '1437390138231',
    empty: ''
  };
  const encoded = 'name 0YHQv9GD0YLQvdC40LoubXA0,lastModified MTQzNzM5MDEzODIzMQ==,empty';
  it('serialize', () => {
    expect(b64.serialize(data)).toBe(encoded);
  });
  it('parse', () => {
    expect(b64.parse(encoded)).toEqual(data);
  });

  it('encode', () => {
    expect(b64.encode('')).toBe('');
    expect(b64.encode(undefined as unknown as string)).toBe('dW5kZWZpbmVk');
    expect(b64.encode('string')).toBe('c3RyaW5n');
  });
});

describe('primitives', () => {
  it('isNumber', () => {
    expect(isNumber(NaN)).toBe(false);
    expect(isNumber(null as any)).toBe(false);
    expect(isNumber(undefined)).toBe(false);
    expect(isNumber(0)).toBe(true);
  });
  it('unfunc', () => {
    expect(unfunc(10, 2)).toBe(10);
    expect(unfunc((x: number) => 10 * x, 2)).toBe(20);
  });
});
