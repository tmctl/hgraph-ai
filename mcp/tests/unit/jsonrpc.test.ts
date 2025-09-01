import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock axios before importing the module
const mockAxios = {
  post: jest.fn() as jest.MockedFunction<any>,
  isAxiosError: jest.fn() as jest.MockedFunction<any>,
};

jest.mock('axios', () => mockAxios);

import {
  executeJsonRpcMethod,
  getChainId,
  getBlockByNumber,
  getTransactionByHash,
  ethCall,
  listJsonRpcMethods,
} from '../../src/tools/jsonrpc';

describe('JSON-RPC Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set up default environment
    process.env.HGRAPH_NETWORK = 'mainnet';
    process.env.HGRAPH_API_KEY = 'test_api_key';
  });

  afterEach(() => {
    jest.resetAllMocks();
    delete process.env.HGRAPH_NETWORK;
    delete process.env.HGRAPH_API_KEY;
  });

  describe('executeJsonRpcMethod', () => {
    it('should execute a valid JSON-RPC method', async () => {
      const mockResponse = {
        data: {
          jsonrpc: '2.0',
          result: '0x127',
          id: 123,
        },
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await executeJsonRpcMethod('eth_chainId', []);

      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://mainnet.hedera.api.hgraph.io/v1/test_api_key/rpc',
        {
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
          id: expect.any(Number),
        },
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000,
        }),
      );

      expect(result.content[0].text).toContain('# JSON-RPC Response');
      expect(result.content[0].text).toContain('eth_chainId');
      expect(result.content[0].text).toContain('"0x127"');
    });

    it('should handle RPC errors', async () => {
      const mockResponse = {
        data: {
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: 'Method not found',
          },
          id: 123,
        },
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      await expect(executeJsonRpcMethod('invalid_method', [])).rejects.toThrow(
        'JSON-RPC execution failed: RPC Error (-32601): Method not found',
      );
    });

    it('should handle unsupported methods', async () => {
      await expect(executeJsonRpcMethod('eth_mining', [])).rejects.toThrow();
    });

    it('should handle HTTP errors', async () => {
      mockAxios.post.mockRejectedValue({
        response: { status: 401, statusText: 'Unauthorized' },
      });
      mockAxios.isAxiosError.mockReturnValue(true);

      await expect(executeJsonRpcMethod('eth_chainId', [])).rejects.toThrow(
        'JSON-RPC execution failed: Unauthorized: Invalid or missing API key',
      );
    });
  });

  describe('getChainId', () => {
    it('should get and format chain ID', async () => {
      const mockResponse = {
        data: {
          jsonrpc: '2.0',
          result: '0x127',
          id: 123,
        },
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await getChainId();

      expect(result.content[0].text).toContain('# Hedera Chain ID');
      expect(result.content[0].text).toContain('**Chain ID (hex):** 0x127');
      expect(result.content[0].text).toContain('**Chain ID (decimal):** 295');
      expect(result.content[0].text).toContain('Mainnet: 295 (0x127)');
    });
  });

  describe('getBlockByNumber', () => {
    it('should get block information', async () => {
      const mockBlock = {
        hash: '0x1234567890abcdef',
        parentHash: '0xabcdef1234567890',
        timestamp: '0x60000000',
        gasUsed: '0x5208',
        gasLimit: '0xf4240',
        transactions: ['0xtx1', '0xtx2'],
      };
      const mockResponse = {
        data: {
          jsonrpc: '2.0',
          result: mockBlock,
          id: 123,
        },
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await getBlockByNumber('latest', false);

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'eth_getBlockByNumber',
          params: ['latest', false],
        }),
        expect.any(Object),
      );

      expect(result.content[0].text).toContain('# Block Information');
      expect(result.content[0].text).toContain('**Hash:** 0x1234567890abcdef');
      expect(result.content[0].text).toContain('**Transaction Count:** 2');
    });

    it('should handle block not found', async () => {
      const mockResponse = {
        data: {
          jsonrpc: '2.0',
          result: null,
          id: 123,
        },
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      await expect(getBlockByNumber('0x999999', false)).rejects.toThrow('Block not found');
    });
  });

  describe('getTransactionByHash', () => {
    it('should get transaction details', async () => {
      const mockTx = {
        blockNumber: '0x1234',
        from: '0xfrom',
        to: '0xto',
        value: '0xde0b6b3a7640000', // 1 ETH
        gas: '0x5208',
        gasPrice: '0x3b9aca00', // 1 Gwei
        nonce: '0x5',
        input: '0x',
      };
      const mockResponse = {
        data: {
          jsonrpc: '2.0',
          result: mockTx,
          id: 123,
        },
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await getTransactionByHash('0xhash');

      expect(result.content[0].text).toContain('# Transaction Details');
      expect(result.content[0].text).toContain('**From:** 0xfrom');
      expect(result.content[0].text).toContain('**To:** 0xto');
      expect(result.content[0].text).toContain('**Value:** 1 ETH');
    });

    it('should add 0x prefix if missing', async () => {
      const mockResponse = {
        data: {
          jsonrpc: '2.0',
          result: { blockNumber: '0x1' },
          id: 123,
        },
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      await getTransactionByHash('hash_without_prefix');

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: ['0xhash_without_prefix'],
        }),
        expect.any(Object),
      );
    });
  });

  describe('ethCall', () => {
    it('should execute smart contract call', async () => {
      const mockResponse = {
        data: {
          jsonrpc: '2.0',
          result: '0x48656c6c6f', // "Hello" in hex
          id: 123,
        },
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await ethCall('0xcontract', '0xdata', 'latest');

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'eth_call',
          params: [{ to: '0xcontract', data: '0xdata' }, 'latest'],
        }),
        expect.any(Object),
      );

      expect(result.content[0].text).toContain('# Smart Contract Call Result');
      expect(result.content[0].text).toContain('**Raw Response:** 0x48656c6c6f');
      expect(result.content[0].text).toContain('Hello'); // Decoded result
    });
  });

  // sendRawTransaction tests removed - function removed for security

  describe('listJsonRpcMethods', () => {
    it('should list all supported methods', async () => {
      const result = await listJsonRpcMethods();

      expect(result.content[0].text).toContain('# Supported JSON-RPC Methods');
      expect(result.content[0].text).toContain('eth_chainId');
      expect(result.content[0].text).toContain('eth_getBlockByNumber');
      expect(result.content[0].text).toContain('eth_getTransactionByHash');
      expect(result.content[0].text).toContain('eth_call');
      // eth_sendRawTransaction removed for security
      expect(result.content[0].text).toContain('**Network:** mainnet');
    });

    it('should warn when no API key is configured', async () => {
      delete process.env.HGRAPH_API_KEY;

      const result = await listJsonRpcMethods();

      expect(result.content[0].text).toContain('⚠️ **Warning:** No API key configured');
    });
  });

  describe('Environment configuration', () => {
    it('should use testnet when configured', async () => {
      process.env.HGRAPH_NETWORK = 'testnet';
      const mockResponse = {
        data: {
          jsonrpc: '2.0',
          result: '0x128',
          id: 123,
        },
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      await getChainId();

      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://testnet.hedera.api.hgraph.io/v1/test_api_key/rpc',
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should work without API key (using public endpoint)', async () => {
      delete process.env.HGRAPH_API_KEY;
      const mockResponse = {
        data: {
          jsonrpc: '2.0',
          result: '0x127',
          id: 123,
        },
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      await getChainId();

      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://mainnet.hedera.api.hgraph.io/rpc',
        expect.any(Object),
        expect.any(Object),
      );
    });
  });
});
