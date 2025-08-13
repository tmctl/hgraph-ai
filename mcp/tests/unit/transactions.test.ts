import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mockTransactionResponse } from './test-helpers';

// Mock axios module
jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  patch: jest.fn(),
  isAxiosError: jest.fn(),
  create: jest.fn(),
}));

import axios from 'axios';
import { getTransactionHistory } from '../../src/tools/transactions';

const mockAxios = axios as any;

describe('Transaction Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('getTransactionHistory', () => {
    it('should get transaction history successfully', async () => {
      mockAxios.get.mockResolvedValue({ data: mockTransactionResponse });

      const result = await getTransactionHistory('0.0.123456', 10, 'desc');

      expect(mockAxios.get).toHaveBeenCalledWith(
        'https://mainnet.api.hgraph.io/v1/api/v1/transactions',
        expect.objectContaining({
          params: {
            'account.id': '0.0.123456',
            limit: '10',
            order: 'desc',
          },
          timeout: 15000,
          headers: expect.objectContaining({
            Accept: 'application/json',
            'User-Agent': 'Hgraph-MCP-Server/1.0',
          }),
        }),
      );

      expect(result.content[0].text).toContain('# Transaction History for 0.0.123456');
      expect(result.content[0].text).toContain('**Total transactions returned:** 1');
      expect(result.content[0].text).toContain('**Hash:** 0x1234567890abcdef...');
      expect(result.content[0].text).toContain('**Type:** CRYPTOTRANSFER');
      expect(result.content[0].text).toContain('**Result:** SUCCESS');
    });

    it('should use default parameters', async () => {
      mockAxios.get.mockResolvedValue({ data: mockTransactionResponse });

      await getTransactionHistory('0.0.123456');

      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            limit: '10',
            order: 'desc',
          }),
        }),
      );
    });

    it('should throw error for invalid account ID', async () => {
      await expect(getTransactionHistory('invalid')).rejects.toThrow('Invalid account ID format');
    });

    it('should throw error for invalid limit', async () => {
      await expect(getTransactionHistory('0.0.123456', 0)).rejects.toThrow(
        'Limit must be between 1 and 100',
      );
      await expect(getTransactionHistory('0.0.123456', 101)).rejects.toThrow(
        'Limit must be between 1 and 100',
      );
    });

    it('should handle empty transaction list', async () => {
      mockAxios.get.mockResolvedValue({ data: { transactions: [] } });

      const result = await getTransactionHistory('0.0.999999');

      expect(result.content[0].text).toContain('No transactions found for account 0.0.999999');
    });

    it('should handle 404 errors', async () => {
      mockAxios.get.mockRejectedValue({
        isAxiosError: true,
        response: { status: 404, statusText: 'Not Found' },
      });
      mockAxios.isAxiosError.mockReturnValue(true);

      await expect(getTransactionHistory('0.0.999999')).rejects.toThrow(
        'No transactions found for account 0.0.999999',
      );
    });

    it('should decode base64 memo', async () => {
      const transactionWithMemo = {
        transactions: [
          {
            ...mockTransactionResponse.transactions[0],
            memo_base64: Buffer.from('Test memo').toString('base64'),
          },
        ],
      };
      mockAxios.get.mockResolvedValue({ data: transactionWithMemo });

      const result = await getTransactionHistory('0.0.123456');

      expect(result.content[0].text).toContain('**Memo:** Test memo');
    });

    it('should handle invalid base64 memo', async () => {
      const transactionWithBadMemo = {
        transactions: [
          {
            ...mockTransactionResponse.transactions[0],
            memo_base64: 'invalid-base64!@#',
          },
        ],
      };
      mockAxios.get.mockResolvedValue({ data: transactionWithBadMemo });

      const result = await getTransactionHistory('0.0.123456');

      // Invalid base64 should show the raw base64 string when decoding fails
      expect(result.content[0].text).toContain('**Memo:**');
    });

    it('should display token transfers', async () => {
      const transactionWithTokens = {
        transactions: [
          {
            ...mockTransactionResponse.transactions[0],
            token_transfers: [
              {
                token_id: '0.0.456789',
                account: '0.0.123456',
                amount: -1000,
              },
              {
                token_id: '0.0.456789',
                account: '0.0.789012',
                amount: 1000,
              },
            ],
          },
        ],
      };
      mockAxios.get.mockResolvedValue({ data: transactionWithTokens });

      const result = await getTransactionHistory('0.0.123456');

      expect(result.content[0].text).toContain('**Token Transfers:**');
      expect(result.content[0].text).toContain('- 0.0.123456: -1000 (0.0.456789)');
      expect(result.content[0].text).toContain('- 0.0.789012: +1000 (0.0.456789)');
    });

    it('should display NFT transfers', async () => {
      const transactionWithNFTs = {
        transactions: [
          {
            ...mockTransactionResponse.transactions[0],
            nft_transfers: [
              { serial_number: 1, token_id: '0.0.456789' },
              { serial_number: 2, token_id: '0.0.456789' },
            ],
          },
        ],
      };
      mockAxios.get.mockResolvedValue({ data: transactionWithNFTs });

      const result = await getTransactionHistory('0.0.123456');

      expect(result.content[0].text).toContain('**NFT Transfers:** 2 NFT(s) transferred');
    });

    it('should display staking rewards', async () => {
      const transactionWithRewards = {
        transactions: [
          {
            ...mockTransactionResponse.transactions[0],
            staking_reward_transfers: [{ account: '0.0.123456', amount: 1000000 }],
          },
        ],
      };
      mockAxios.get.mockResolvedValue({ data: transactionWithRewards });

      const result = await getTransactionHistory('0.0.123456');

      expect(result.content[0].text).toContain('**Staking Rewards:** Yes');
    });

    it('should format HBAR amounts correctly', async () => {
      mockAxios.get.mockResolvedValue({ data: mockTransactionResponse });

      const result = await getTransactionHistory('0.0.123456');

      // Fee should be converted from tinybars to HBAR
      expect(mockTransactionResponse.transactions[0].charged_tx_fee).toBe(100000);
      expect(result.content[0].text).toContain('**Fee:** 0.00100000 ℏ');
    });
  });
});
