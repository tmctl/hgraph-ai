import { jest } from '@jest/globals';

const mockRequest = jest.fn() as jest.MockedFunction<any>;

export const GraphQLClient = jest.fn().mockImplementation(() => ({
  request: mockRequest,
}));

export { mockRequest };
