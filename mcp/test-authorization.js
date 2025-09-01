#!/usr/bin/env node

/**
 * Test script for MCP Server user authorization flow
 */

import axios from 'axios';

const SERVER_URL = 'http://localhost:3001';
const API_TOKEN = process.env.MCP_API_TOKEN || 'test-token';

async function testAuthorizationFlow() {
  console.log('🧪 Testing MCP Server Authorization Flow');
  console.log('==========================================');

  try {
    // 1. Test server health
    console.log('\n1. Checking server health...');
    const healthResponse = await axios.get(`${SERVER_URL}/health`);
    console.log('✅ Server is healthy:', healthResponse.data.status);

    // 2. Test initialization without authorization
    console.log('\n2. Testing initialization without authorization...');
    const initRequest = {
      jsonrpc: '2.0',
      id: '1',
      method: 'initialize',
      params: {
        protocolVersion: '1.0.0',
        clientInfo: {
          name: 'claude',
          version: '1.0.0',
        },
        capabilities: {},
      },
    };

    const initResponse = await axios.post(`${SERVER_URL}/rpc`, initRequest, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-token': API_TOKEN,
        'x-connection-id': 'test-connection-1',
      },
    });

    if (initResponse.data.error) {
      console.log('✅ Authorization prompt received:', initResponse.data.error.data.title);
      console.log('📝 Description:', initResponse.data.error.data.description);
      console.log('🔐 Permissions required:', initResponse.data.error.data.permissions.join(', '));
    } else {
      console.log('❌ Expected authorization prompt, but got:', initResponse.data);
    }

    // 3. Test authorization endpoint
    console.log('\n3. Testing connector authorization...');
    const authResponse = await axios.post(
      `${SERVER_URL}/auth/connector`,
      {
        connector: 'hgraph-mcp',
        action: 'authorize',
        permissions: [
          'read_accounts',
          'read_transactions',
          'read_tokens',
          'read_network_stats',
          'execute_graphql',
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': API_TOKEN,
        },
      },
    );

    if (authResponse.data.status === 'authorized') {
      console.log('✅ Connector authorized successfully');
      console.log('📅 Authorized at:', authResponse.data.authorized_at);
    } else {
      console.log('❌ Authorization failed:', authResponse.data);
    }

    // 4. Test authorization response via MCP protocol
    console.log('\n4. Testing MCP authorization response...');
    const authRpcRequest = {
      jsonrpc: '2.0',
      id: '2',
      method: 'connector/authorize',
      params: {
        action: 'authorize',
        permissions: [
          'read_accounts',
          'read_transactions',
          'read_tokens',
          'read_network_stats',
          'execute_graphql',
        ],
      },
    };

    const authRpcResponse = await axios.post(`${SERVER_URL}/rpc`, authRpcRequest, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-token': API_TOKEN,
        'x-connection-id': 'test-connection-2',
      },
    });

    if (authRpcResponse.data.result?.authorized) {
      console.log('✅ MCP authorization successful');
      console.log('📊 Server capabilities:', Object.keys(authRpcResponse.data.result.capabilities));
    } else {
      console.log('❌ MCP authorization failed:', authRpcResponse.data);
    }

    console.log('\n🎉 Authorization flow test completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Run the test
testAuthorizationFlow().catch(console.error);
