import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mockAccountResponse } from './test-helpers';

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
import { getAccountInfo } from '../../src/tools/account';

const mockAxios = axios as any;

describe('Account Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('getAccountInfo', () => {
    it('should get account information successfully', async () => {
      mockAxios.get.mockResolvedValue({ data: mockAccountResponse });

      const result = await getAccountInfo('0.0.123456');

      expect(mockAxios.get).toHaveBeenCalledWith(
        'https://mainnet.api.hgraph.io/v1/api/v1/accounts/0.0.123456',
        expect.objectContaining({
          timeout: 10000,
          headers: expect.objectContaining({
            Accept: 'application/json',
            'User-Agent': 'Hgraph-MCP-Server/1.0',
          }),
        }),
      );

      expect(result.content[0].text).toContain('# Account Information for 0.0.123456');
      expect(result.content[0].text).toContain('**Account ID:** 0.0.123456');
      expect(result.content[0].text).toContain('**HBAR Balance:** 10.00000000 ℏ');
      expect(result.content[0].text).toContain('**Deleted:** No');
      expect(result.content[0].text).toContain('**Memo:** Test account');
    });

    it('should throw error for invalid account ID format', async () => {
      await expect(getAccountInfo('invalid')).rejects.toThrow('Invalid account ID format');
      await expect(getAccountInfo('0.0')).rejects.toThrow('Invalid account ID format');
      await expect(getAccountInfo('123456')).rejects.toThrow('Invalid account ID format');
    });

    it('should handle 404 errors', async () => {
      mockAxios.get.mockRejectedValue({
        isAxiosError: true,
        response: { status: 404, statusText: 'Not Found' },
      });
      mockAxios.isAxiosError.mockReturnValue(true);

      await expect(getAccountInfo('0.0.999999')).rejects.toThrow('Account 0.0.999999 not found');
    });

    it('should handle other API errors', async () => {
      mockAxios.get.mockRejectedValue({
        isAxiosError: true,
        response: { status: 500, statusText: 'Internal Server Error' },
      });
      mockAxios.isAxiosError.mockReturnValue(true);

      await expect(getAccountInfo('0.0.123456')).rejects.toThrow(
        'API request failed: 500 Internal Server Error',
      );
    });

    it('should handle network errors', async () => {
      mockAxios.get.mockRejectedValue(new Error('Network error'));
      mockAxios.isAxiosError.mockReturnValue(false);

      await expect(getAccountInfo('0.0.123456')).rejects.toThrow('Network error');
    });

    it('should display account with EVM address', async () => {
      const accountWithEvm = {
        ...mockAccountResponse,
        evm_address: '0x1234567890abcdef1234567890abcdef12345678',
      };
      mockAxios.get.mockResolvedValue({ data: accountWithEvm });

      const result = await getAccountInfo('0.0.123456');

      expect(result.content[0].text).toContain(
        '**EVM Address:** 0x1234567890abcdef1234567890abcdef12345678',
      );
    });

    it('should display staking information', async () => {
      const stakedAccount = {
        ...mockAccountResponse,
        staked_node_id: 0,
        pending_reward: 50000000, // 0.5 HBAR
      };
      mockAxios.get.mockResolvedValue({ data: stakedAccount });

      const result = await getAccountInfo('0.0.123456');

      expect(result.content[0].text).toContain('**Staked to Node:** 0');
      expect(result.content[0].text).toContain('**Pending Reward:** 0.50000000 ℏ');
    });

    it('should display token holdings', async () => {
      const accountWithTokens = {
        ...mockAccountResponse,
        balance: {
          ...mockAccountResponse.balance,
          tokens: [
            { token_id: '0.0.456789', balance: 1000 },
            { token_id: '0.0.789012', balance: 500 },
          ],
        },
      };
      mockAxios.get.mockResolvedValue({ data: accountWithTokens });

      const result = await getAccountInfo('0.0.123456');

      expect(result.content[0].text).toContain('## Token Holdings');
      expect(result.content[0].text).toContain('- **0.0.456789:** 1000');
      expect(result.content[0].text).toContain('- **0.0.789012:** 500');
    });

    it('should truncate long public keys', async () => {
      mockAxios.get.mockResolvedValue({ data: mockAccountResponse });

      const result = await getAccountInfo('0.0.123456');

      // The key should be truncated in the display
      expect(mockAccountResponse.key.key.length).toBeGreaterThan(20);
      expect(result.content[0].text).toContain('302a300506032b657003...');
    });
  });
});
