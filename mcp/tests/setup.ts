import { jest } from '@jest/globals';

// Global test setup
beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.HGRAPH_GRAPHQL_URL = 'https://test.api.hgraph.io/v1/graphql';
  process.env.HGRAPH_REST_URL = 'https://test.api.hgraph.io/v1/api/v1';
  process.env.HGRAPH_API_KEY = 'test-api-key';
  process.env.DB_HOST = 'localhost';
  process.env.DB_PORT = '5432';
  process.env.DB_DATABASE = 'test_hgraph';
  process.env.DB_USERNAME = 'test_user';
  process.env.DB_PASSWORD = 'test_password';
  process.env.DB_SSL = 'false';
});

// Global test cleanup
afterAll(() => {
  jest.clearAllMocks();
});

// Global test timeout
jest.setTimeout(10000);
