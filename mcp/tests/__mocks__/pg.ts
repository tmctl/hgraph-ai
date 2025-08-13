import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockConnect = jest.fn(() => Promise.resolve());
const mockEnd = jest.fn(() => Promise.resolve());

const mockClient = {
  query: mockQuery,
  connect: mockConnect,
  end: mockEnd,
};

export const Client = jest.fn().mockImplementation(() => mockClient);

export { mockQuery, mockConnect, mockEnd, mockClient };
