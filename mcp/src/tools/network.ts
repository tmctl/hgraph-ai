import axios from 'axios';
import { z } from 'zod';

const HGRAPH_API_BASE =
  process.env.HGRAPH_REST_URL ||
  'https://mainnet.hedera.api.hgraph.io/v1/pk_prod_ab2c41b848c0b568e96a31ef0ca2f2fbaa549470/api/v1';

const NetworkNodeSchema = z.object({
  description: z.string(),
  file_id: z.string(),
  max_stake: z.number(),
  memo: z.string(),
  min_stake: z.number(),
  node_account_id: z.string(),
  node_cert_hash: z.string(),
  node_id: z.number(),
  public_key: z.string(),
  reward_rate_start: z.number(),
  service_endpoints: z.array(
    z.object({
      ip_address_v4: z.string(),
      port: z.number(),
    }),
  ),
  stake: z.number(),
  stake_not_rewarded: z.number(),
  stake_rewarded: z.number(),
  timestamp: z.object({
    from: z.string(),
    to: z.string().optional(),
  }),
});

const NetworkNodesSchema = z.object({
  nodes: z.array(NetworkNodeSchema),
});

const NetworkSupplySchema = z.object({
  released_supply: z.string(),
  timestamp: z.string(),
  total_supply: z.string(),
});

export async function getNetworkStats(metric: string = 'all') {
  try {
    let result = '# Hedera Network Statistics\n\n';

    if (metric === 'all' || metric === 'nodes') {
      try {
        const nodesResponse = await axios.get(`${HGRAPH_API_BASE}/network/nodes`, {
          timeout: 15000,
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Hgraph-MCP-Server/1.0',
          },
        });

        const nodesData = NetworkNodesSchema.parse(nodesResponse.data);

        result += `## Network Nodes\n`;
        result += `**Total Nodes:** ${nodesData.nodes.length}\n`;

        let totalStake = 0;
        let totalStakeRewarded = 0;
        let totalStakeNotRewarded = 0;

        nodesData.nodes.forEach((node) => {
          totalStake += node.stake;
          totalStakeRewarded += node.stake_rewarded;
          totalStakeNotRewarded += node.stake_not_rewarded;
        });

        const totalStakeHbar = (totalStake / 100000000).toFixed(0);
        const totalStakeRewardedHbar = (totalStakeRewarded / 100000000).toFixed(0);
        const totalStakeNotRewardedHbar = (totalStakeNotRewarded / 100000000).toFixed(0);

        result += `**Total Stake:** ${totalStakeHbar} ℏ\n`;
        result += `**Rewarded Stake:** ${totalStakeRewardedHbar} ℏ\n`;
        result += `**Non-Rewarded Stake:** ${totalStakeNotRewardedHbar} ℏ\n\n`;

        if (metric === 'nodes') {
          result += '### Node Details\n';
          nodesData.nodes.forEach((node) => {
            const nodeStake = (node.stake / 100000000).toFixed(0);
            const minStake = (node.min_stake / 100000000).toFixed(0);
            const maxStake = (node.max_stake / 100000000).toFixed(0);

            result += `**Node ${node.node_id}** (${node.node_account_id})\n`;
            result += `  - Description: ${node.description}\n`;
            result += `  - Stake: ${nodeStake} ℏ (min: ${minStake}, max: ${maxStake})\n`;
            result += `  - Endpoints: ${node.service_endpoints.length} endpoint(s)\n`;
            if (node.memo) {
              result += `  - Memo: ${node.memo}\n`;
            }
            result += '\n';
          });
        }
      } catch (error) {
        result += `**Nodes:** Error fetching node data\n\n`;
      }
    }

    if (metric === 'all' || metric === 'supply') {
      try {
        const supplyResponse = await axios.get(`${HGRAPH_API_BASE}/network/supply`, {
          timeout: 10000,
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Hgraph-MCP-Server/1.0',
          },
        });

        const supplyData = NetworkSupplySchema.parse(supplyResponse.data);
        const timestamp = new Date(parseFloat(supplyData.timestamp) * 1000).toISOString();

        const totalSupply = (parseInt(supplyData.total_supply) / 100000000).toFixed(0);
        const releasedSupply = (parseInt(supplyData.released_supply) / 100000000).toFixed(0);
        const unreleased =
          (parseInt(supplyData.total_supply) - parseInt(supplyData.released_supply)) / 100000000;

        result += `## HBAR Supply\n`;
        result += `**Total Supply:** ${totalSupply} ℏ\n`;
        result += `**Released Supply:** ${releasedSupply} ℏ\n`;
        result += `**Unreleased Supply:** ${unreleased.toFixed(0)} ℏ\n`;
        result += `**Last Updated:** ${timestamp}\n\n`;
      } catch (error) {
        result += `**Supply:** Error fetching supply data\n\n`;
      }
    }

    if (metric === 'all' || metric === 'tps') {
      result += `## Transaction Performance\n`;
      result += `**Note:** Real-time TPS data requires access to live transaction stream.\n`;
      result += `Use the transaction history tool to analyze recent transaction volume.\n\n`;
    }

    if (metric === 'all') {
      result += `## API Information\n`;
      result += `**Mirror Node:** ${HGRAPH_API_BASE}\n`;
      result += `**Data Source:** Hedera Mirror Node REST API\n`;
      result += `**Network:** ${HGRAPH_API_BASE.includes('testnet') ? 'Testnet' : 'Mainnet'}\n`;
    }

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        `API request failed: ${error.response?.status} ${error.response?.statusText}`,
      );
    }
    throw error;
  }
}
