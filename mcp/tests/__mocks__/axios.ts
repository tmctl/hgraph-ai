import { jest } from '@jest/globals';

const mockAxios = {
  get: jest.fn() as jest.MockedFunction<any>,
  post: jest.fn() as jest.MockedFunction<any>,
  put: jest.fn() as jest.MockedFunction<any>,
  delete: jest.fn() as jest.MockedFunction<any>,
  patch: jest.fn() as jest.MockedFunction<any>,
  isAxiosError: jest.fn() as jest.MockedFunction<any>,
  create: jest.fn(() => mockAxios) as jest.MockedFunction<any>,
};

export default mockAxios;
