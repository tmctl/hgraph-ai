import { describe, it, expect } from '@jest/globals';

describe('Basic Test Suite', () => {
  it('should run basic tests', () => {
    expect(1 + 1).toBe(2);
  });

  it('should test string operations', () => {
    const result = 'Hello World';
    expect(result).toContain('Hello');
    expect(result).toHaveLength(11);
  });

  it('should test array operations', () => {
    const arr = [1, 2, 3, 4, 5];
    expect(arr).toHaveLength(5);
    expect(arr[0]).toBe(1);
    expect(arr.includes(3)).toBe(true);
  });

  it('should test object operations', () => {
    const obj = { name: 'Test', value: 42 };
    expect(obj.name).toBe('Test');
    expect(obj.value).toBe(42);
    expect(Object.keys(obj)).toEqual(['name', 'value']);
  });
});

describe('Environment Tests', () => {
  it('should have test environment variables', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('should have access to global objects', () => {
    expect(global).toBeDefined();
    expect(console).toBeDefined();
  });
});
