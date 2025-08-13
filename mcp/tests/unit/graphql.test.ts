import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { executeGraphQLQuery, getGraphQLSchema, buildGraphQLQuery } from '../../src/tools/graphql';
import { mockRequest } from '../__mocks__/graphql-request';
import { mockGraphQLResponse, mockSchemaIntrospectionResponse } from './test-helpers';

jest.mock('graphql-request');

describe('GraphQL Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('executeGraphQLQuery', () => {
    it('should execute a valid GraphQL query', async () => {
      const query = 'query { account(id: "0.0.123456") { id balance } }';
      mockRequest.mockResolvedValue(mockGraphQLResponse);

      const result = await executeGraphQLQuery(query);

      expect(mockRequest).toHaveBeenCalledWith(query, undefined);
      expect(result.content[0].text).toContain('# GraphQL Query Result');
      expect(result.content[0].text).toContain(query);
      expect(result.content[0].text).toContain(JSON.stringify(mockGraphQLResponse, null, 2));
    });

    it('should execute a GraphQL query with variables', async () => {
      const query =
        'query GetAccount($accountId: String!) { account(id: $accountId) { id balance } }';
      const variables = { accountId: '0.0.123456' };
      mockRequest.mockResolvedValue(mockGraphQLResponse);

      const result = await executeGraphQLQuery(query, variables);

      expect(mockRequest).toHaveBeenCalledWith(query, variables);
      expect(result.content[0].text).toContain('## Variables');
      expect(result.content[0].text).toContain(JSON.stringify(variables, null, 2));
    });

    it('should throw error for empty query', async () => {
      await expect(executeGraphQLQuery('')).rejects.toThrow('GraphQL query cannot be empty');
    });

    it('should throw error for invalid query format', async () => {
      await expect(executeGraphQLQuery('invalid query')).rejects.toThrow(
        'Invalid GraphQL query format',
      );
    });

    it('should handle GraphQL errors', async () => {
      const query = 'query { invalidField }';
      const error = {
        response: {
          errors: [
            {
              message: 'Field "invalidField" does not exist',
              locations: [{ line: 1, column: 9 }],
            },
          ],
        },
      };
      mockRequest.mockRejectedValue(error);

      await expect(executeGraphQLQuery(query)).rejects.toThrow(
        /Field "invalidField" does not exist/,
      );
    });
  });

  describe('getGraphQLSchema', () => {
    it('should fetch and format GraphQL schema', async () => {
      // Mock a complete valid introspection response (without data wrapper since graphql-request returns the data directly)
      const validIntrospection = {
        __schema: {
          queryType: { name: 'Query' },
          mutationType: null,
          subscriptionType: null,
          types: [
            {
              kind: 'OBJECT',
              name: 'Query',
              description: null,
              fields: [
                {
                  name: 'account',
                  description: null,
                  args: [],
                  type: { kind: 'SCALAR', name: 'String', ofType: null },
                  isDeprecated: false,
                  deprecationReason: null,
                },
              ],
              inputFields: null,
              interfaces: [],
              enumValues: null,
              possibleTypes: null,
            },
            {
              kind: 'SCALAR',
              name: 'String',
              description: 'The `String` scalar type represents textual data',
              fields: null,
              inputFields: null,
              interfaces: null,
              enumValues: null,
              possibleTypes: null,
            },
          ],
          directives: [],
        },
      };

      mockRequest.mockResolvedValue(validIntrospection);

      const result = await getGraphQLSchema();

      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('IntrospectionQuery'));
      expect(result.content[0].text).toContain('# Hgraph GraphQL Schema');
      expect(result.content[0].text).toContain('## Schema Definition');
    });

    it('should handle schema fetch errors', async () => {
      mockRequest.mockRejectedValue(new Error('Network error'));

      await expect(getGraphQLSchema()).rejects.toThrow(
        'Failed to fetch GraphQL schema: Network error',
      );
    });
  });

  describe('buildGraphQLQuery', () => {
    it('should build account query from description', async () => {
      const description = 'Get account information';

      const result = await buildGraphQLQuery(description);

      expect(result.content[0].text).toContain('# GraphQL Query Builder');
      expect(result.content[0].text).toContain(description);
      expect(result.content[0].text).toContain('query');
      expect(result.content[0].text).toContain('entity');
    });

    it('should build transaction query from description', async () => {
      const description = 'Get transaction history';

      const result = await buildGraphQLQuery(description);

      expect(result.content[0].text).toContain('query GetTransactions');
      expect(result.content[0].text).toContain('transactions');
    });

    it('should build token query from description', async () => {
      const description = 'Get token balances';

      const result = await buildGraphQLQuery(description);

      expect(result.content[0].text).toContain('tokenBalances');
    });

    it('should build network query from description', async () => {
      const description = 'Get network statistics';

      const result = await buildGraphQLQuery(description);

      expect(result.content[0].text).toContain('networkNodes');
      expect(result.content[0].text).toContain('networkSupply');
    });

    it('should handle custom query descriptions', async () => {
      const description = 'Custom data query';

      const result = await buildGraphQLQuery(description);

      expect(result.content[0].text).toContain('## Custom Query Template');
      expect(result.content[0].text).toContain('query CustomQuery');
    });

    it('should include return fields when specified', async () => {
      const description = 'Get account data';
      const returnFields = ['id', 'balance', 'createdTimestamp'];

      const result = await buildGraphQLQuery(description, returnFields);

      expect(result.content[0].text).toContain('# GraphQL Query Builder');
    });
  });
});
