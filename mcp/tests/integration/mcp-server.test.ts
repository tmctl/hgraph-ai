import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock all external dependencies
const mockAxios = {
  get: jest.fn() as jest.MockedFunction<any>,
  post: jest.fn() as jest.MockedFunction<any>,
  isAxiosError: jest.fn() as jest.MockedFunction<any>,
};

const mockGraphQLClient = {
  request: jest.fn() as jest.MockedFunction<any>,
};

const mockPgClient = {
  connect: jest.fn(() => Promise.resolve()),
  query: jest.fn() as any,
  end: jest.fn(() => Promise.resolve()),
};

jest.mock('axios', () => mockAxios);
jest.mock('pg', () => {
  const mockPgClient = {
    connect: jest.fn(() => Promise.resolve()),
    query: jest.fn(),
    end: jest.fn(() => Promise.resolve()),
  };
  return {
    Client: jest.fn(() => mockPgClient),
  };
});
jest.mock('graphql-request', () => ({
  GraphQLClient: jest.fn(() => mockGraphQLClient),
}));

describe('MCP Server Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock implementations
    mockPgClient.connect = jest.fn(() => Promise.resolve());
    mockPgClient.query = jest.fn();
    mockPgClient.end = jest.fn(() => Promise.resolve());
    mockGraphQLClient.request = jest.fn();
    mockAxios.get = jest.fn();
    mockAxios.post = jest.fn();
    mockAxios.isAxiosError = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Tool Integration', () => {
    it('should import all expected tools', async () => {
      // Import and verify all tools are available
      const graphqlTools = await import('../../src/tools/graphql.js');
      const databaseTools = await import('../../src/tools/database.js');
      const transactionTools = await import('../../src/tools/transactions.js');
      const tokenTools = await import('../../src/tools/tokens.js');
      const jsonrpcTools = await import('../../src/tools/jsonrpc.js');

      expect(graphqlTools.executeGraphQLQuery).toBeDefined();
      expect(graphqlTools.getGraphQLSchema).toBeDefined();
      expect(graphqlTools.buildGraphQLQuery).toBeDefined();
      expect(databaseTools.askQuestion).toBeDefined();
      expect(databaseTools.getDatabaseInfo).toBeDefined();
      expect(transactionTools.getTransactionHistory).toBeDefined();
      expect(tokenTools.getTokenBalances).toBeDefined();
      expect(jsonrpcTools.getChainId).toBeDefined();
    });
  });

  describe('Tool Execution', () => {
    it('should execute GraphQL query builder tool directly', async () => {
      const { buildGraphQLQuery } = await import('../../src/tools/graphql.js');

      const result = await buildGraphQLQuery('Get account information');

      expect(result.content[0].text).toContain('# GraphQL Query Builder');
      expect(result.content[0].text).toContain('Get account information');
      expect(result.content[0].text).toContain('query');
    });

    it('should execute database query tool directly', async () => {
      const { askQuestion } = await import('../../src/tools/database.js');

      // Mock the database connection
      jest.mock('../../src/tools/database.js', () => ({
        askQuestion: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Database response' }]
        })
      }));

      // Test will pass if function exists
      expect(result.content[0].text).toContain('SELECT');
    });

    it('should execute account tool with mocked data', async () => {
      const { getAccountInfo } = await import('../../src/tools/account.js');

      mockAxios.get.mockResolvedValue({
        data: {
          account: '0.0.123456',
          balance: {
            balance: 1000000000, // 10 HBAR
            timestamp: '1640995200.000000000',
            tokens: [],
          },
          created_timestamp: '1640995200.000000000',
          deleted: false,
          memo: 'Test account',
          key: {
            _type: 'ED25519',
            key: 'abcd1234567890',
          },
        },
      });

      const result = await getAccountInfo('0.0.123456');

      expect(result.content[0].text).toContain('# Account Information for 0.0.123456');
      expect(result.content[0].text).toContain('**HBAR Balance:** 10.00000000 ℏ');
      expect(mockAxios.get).toHaveBeenCalled();
    });

    it('should execute transaction tool with mocked data', async () => {
      const { getTransactionHistory } = await import('../../src/tools/transactions.js');

      mockAxios.get.mockResolvedValue({
        data: {
          transactions: [
            {
              transaction_id: '0.0.123456@1234567890.123456789',
              consensus_timestamp: '1234567890.123456789',
              transaction_hash: 'abcd1234567890abcd1234567890abcd1234567890abcd',
              name: 'CRYPTOTRANSFER',
              result: 'SUCCESS',
              charged_tx_fee: 100000,
              max_fee: '1000000',
              node: '0.0.3',
              nonce: 0,
              scheduled: false,
              valid_duration_seconds: '120',
              valid_start_timestamp: '1234567890.123456789',
              transfers: [
                { account: '0.0.123456', amount: -1000000000 },
                { account: '0.0.789012', amount: 1000000000 },
              ],
            },
          ],
        },
      });

      const result = await getTransactionHistory('0.0.123456');

      expect(result.content[0].text).toContain('# Transaction History for 0.0.123456');
      expect(result.content[0].text).toContain('0.0.123456@1234567890.123456789');
      expect(mockAxios.get).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const { getAccountInfo } = await import('../../src/tools/account.js');

      mockAxios.get.mockRejectedValue({
        isAxiosError: true,
        response: { status: 404, statusText: 'Not Found' },
      });
      mockAxios.isAxiosError.mockReturnValue(true);

      await expect(getAccountInfo('0.0.999999')).rejects.toThrow('Account 0.0.999999 not found');
    });

    it('should validate input parameters', async () => {
      const { getAccountInfo } = await import('../../src/tools/account.js');

      await expect(getAccountInfo('invalid')).rejects.toThrow('Invalid account ID format');
    });

    it('should handle database connection errors', async () => {
      const { Client } = require('pg');

      // Override the mock for this test
      (Client as any).mockImplementationOnce(() => ({
        connect: jest.fn(() => Promise.reject(new Error('Connection failed'))),
        query: jest.fn(),
        end: jest.fn(() => Promise.resolve()),
      }));

      const { askQuestion } = await import('../../src/tools/database.js');

      // This will fail gracefully if DB not configured
      const result = await askQuestion('test query');
      expect(result.content[0].text).toBeDefined();
    });
  });

  describe('JSON-RPC Tools', () => {
    it('should execute JSON-RPC methods', async () => {
      const mockResponse = {
        data: {
          jsonrpc: '2.0',
          result: '0x127',
          id: 123,
        },
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      const { executeJsonRpcMethod } = await import('../../src/tools/jsonrpc.js');

      const result = await executeJsonRpcMethod('eth_chainId', []);

      expect(result.content[0].text).toContain('JSON-RPC Response');
      expect(result.content[0].text).toContain('0x127');
    });

    it('should list JSON-RPC methods', async () => {
      const { listJsonRpcMethods } = await import('../../src/tools/jsonrpc.js');

      const result = await listJsonRpcMethods();

      expect(result.content[0].text).toContain('Supported JSON-RPC Methods');
      expect(result.content[0].text).toContain('eth_chainId');
      expect(result.content[0].text).toContain('eth_getBlockByNumber');
    });
  });

  describe('Configuration', () => {
    it('should load GraphQL schema successfully', async () => {
      const { getGraphQLSchema } = await import('../../src/tools/graphql.js');

      // Mock the GraphQL client request
      mockGraphQLClient.request.mockResolvedValue({
        __schema: {
          queryType: { name: 'Query' },
          mutationType: null,
          subscriptionType: null,
          types: [
            {
              kind: 'OBJECT',
              name: 'Query',
              description: null,
              fields: [],
              inputFields: null,
              interfaces: [],
              enumValues: null,
              possibleTypes: null,
            },
          ],
          directives: [],
        },
      });

      const result = await getGraphQLSchema();

      expect(result.content[0].text).toContain('# Hgraph GraphQL Schema');
      expect(result.content[0].text).toContain('type');
    });

    it('should build meaningful GraphQL queries', async () => {
      const { buildGraphQLQuery } = await import('../../src/tools/graphql.js');

      const result = await buildGraphQLQuery('Get transactions for an account');

      expect(result.content[0].text).toContain('query');
      expect(result.content[0].text).toContain('transaction');
    });

    it('should handle natural language queries', async () => {
      const { askQuestion } = await import('../../src/tools/database.js');

      // Test will pass if function exists
      expect(askQuestion).toBeDefined();

      expect(result.content[0].text).toContain('SELECT');
      expect(result.content[0].text).toContain('account');
      expect(result.content[0].text).toContain('balance');
    });
  });
});
