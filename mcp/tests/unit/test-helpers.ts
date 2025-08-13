export const mockAccountResponse = {
  account: '0.0.123456',
  balance: {
    balance: 1000000000, // 10 HBAR in tinybars
    timestamp: '1640995200.000000000',
    tokens: [],
  },
  created_timestamp: '1640995200.000000000',
  deleted: false,
  memo: 'Test account',
  key: {
    _type: 'ED25519',
    key: '302a300506032b6570032100abcd1234...',
  },
};

export const mockTransactionResponse = {
  transactions: [
    {
      consensus_timestamp: '1640995200.123456789',
      transaction_hash: '0x1234567890abcdef...',
      transaction_id: '0.0.123456@1640995200.123456789',
      name: 'CRYPTOTRANSFER',
      result: 'SUCCESS',
      charged_tx_fee: 100000, // 0.001 HBAR
      max_fee: '1000000', // 0.01 HBAR max fee
      nonce: 0,
      scheduled: false,
      valid_duration_seconds: '120',
      valid_start_timestamp: '1640995200.123456789',
      node: '0.0.3',
      transfers: [
        {
          account: '0.0.123456',
          amount: -1000000,
        },
        {
          account: '0.0.789012',
          amount: 1000000,
        },
      ],
    },
  ],
};

export const mockTokenResponse = {
  tokens: [
    {
      account: '0.0.123456',
      balance: 1000,
      token_id: '0.0.456789',
      created_timestamp: '1640995200.000000000',
    },
  ],
};

export const mockTokenInfoResponse = {
  token_id: '0.0.456789',
  name: 'Test Token',
  symbol: 'TEST',
  decimals: '8',
  total_supply: '1000000000',
  treasury_account_id: '0.0.123456',
  type: 'FUNGIBLE_COMMON',
  deleted: false,
};

export const mockNetworkNodesResponse = {
  nodes: [
    {
      node_id: 0,
      node_account_id: '0.0.3',
      description: 'Hedera node 0',
      stake: 5000000000000000, // 50M HBAR
      service_endpoints: [
        {
          ip_address_v4: '13.82.40.153',
          port: 50211,
        },
      ],
    },
  ],
};

export const mockNetworkSupplyResponse = {
  total_supply: '5000000000000000000', // 50B HBAR
  released_supply: '2500000000000000000', // 25B HBAR
  timestamp: '1640995200.000000000',
};

export const mockGraphQLResponse = {
  account: {
    id: '0.0.123456',
    balance: '10.00000000',
    createdTimestamp: '2022-01-01T00:00:00.000Z',
  },
};

export const mockSQLQueryResult = {
  rows: [
    {
      id: '0.0.123456',
      balance: 1000000000,
      created_timestamp: '2022-01-01 00:00:00',
    },
  ],
};

export const mockSchemaIntrospectionResponse = {
  data: {
    __schema: {
      queryType: { name: 'Query' },
      mutationType: null,
      subscriptionType: null,
      types: [
        {
          kind: 'OBJECT',
          name: 'Query',
          description: 'Root query type',
          fields: [
            {
              name: 'account',
              description: 'Get account information',
              args: [
                {
                  name: 'id',
                  type: {
                    kind: 'NON_NULL',
                    ofType: { kind: 'SCALAR', name: 'String' },
                  },
                },
              ],
              type: { kind: 'OBJECT', name: 'Account' },
              isDeprecated: false,
            },
          ],
          inputFields: null,
          interfaces: [],
          enumValues: null,
          possibleTypes: null,
        },
        {
          kind: 'OBJECT',
          name: 'Account',
          description: 'Hedera account information',
          fields: [
            {
              name: 'id',
              type: { kind: 'SCALAR', name: 'String' },
              args: [],
              isDeprecated: false,
            },
            {
              name: 'balance',
              type: { kind: 'SCALAR', name: 'String' },
              args: [],
              isDeprecated: false,
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
          description: 'String scalar',
          fields: null,
          inputFields: null,
          interfaces: null,
          enumValues: null,
          possibleTypes: null,
        },
      ],
      directives: [],
    },
  },
};

export const mockJsonRpcResponse = {
  chainId: '0x127',
  block: {
    hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    parentHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    number: '0x1234',
    timestamp: '0x60000000',
    gasUsed: '0x5208',
    gasLimit: '0xf4240',
    miner: '0x0000000000000000000000000000000000000000',
    transactions: ['0xtx1', '0xtx2'],
  },
  transaction: {
    blockNumber: '0x1234',
    blockHash: '0xblockhash',
    from: '0x1234567890abcdef1234567890abcdef12345678',
    to: '0xabcdef1234567890abcdef1234567890abcdef12',
    value: '0xde0b6b3a7640000', // 1 ETH
    gas: '0x5208',
    gasPrice: '0x3b9aca00', // 1 Gwei
    nonce: '0x5',
    transactionIndex: '0x0',
    hash: '0xtxhash1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    input: '0x',
  },
};
