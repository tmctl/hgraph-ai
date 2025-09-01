#!/usr/bin/env node

/**
 * Simple test for authorization endpoints
 */

import axios from 'axios';

const SERVER_URL = 'http://localhost:3001';
const API_TOKEN = process.env.MCP_API_TOKEN || 'test-token';

async function testAuthEndpoints() {
  console.log('🧪 Testing Authorization Endpoints');
  console.log('==================================');

  try {
    // 1. Test server health
    console.log('\n1. Checking server health...');
    const healthResponse = await axios.get(`${SERVER_URL}/health`);
    console.log('✅ Server is healthy:', healthResponse.data.status);

    // 2. Test auth status endpoint
    console.log('\n2. Checking auth status...');
    const statusResponse = await axios.get(`${SERVER_URL}/auth/status`, {
      headers: {
        'x-api-token': API_TOKEN,
      },
    });
    console.log('✅ Auth status:', statusResponse.data.endpoints);

    // 3. Test connector authorization endpoint
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
      console.log('🔐 Permissions:', authResponse.data.permissions.join(', '));
    } else {
      console.log('❌ Authorization failed:', authResponse.data);
    }

    // 4. Test connector denial
    console.log('\n4. Testing connector denial...');
    const denyResponse = await axios.post(
      `${SERVER_URL}/auth/connector`,
      {
        connector: 'hgraph-mcp',
        action: 'deny',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': API_TOKEN,
        },
      },
    );

    if (denyResponse.data.status === 'denied') {
      console.log('✅ Connector denial handled correctly');
      console.log('📝 Message:', denyResponse.data.message);
    } else {
      console.log('❌ Denial test failed:', denyResponse.data);
    }

    // 5. Test insufficient permissions
    console.log('\n5. Testing insufficient permissions...');
    try {
      await axios.post(
        `${SERVER_URL}/auth/connector`,
        {
          connector: 'hgraph-mcp',
          action: 'authorize',
          permissions: ['read_accounts'], // Missing required permissions
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-token': API_TOKEN,
          },
        },
      );
      console.log('❌ Should have failed with insufficient permissions');
    } catch (error) {
      if (error.response?.data?.error === 'insufficient_permissions') {
        console.log('✅ Insufficient permissions handled correctly');
        console.log('📝 Missing:', error.response.data.missing.join(', '));
      } else {
        console.log('❌ Unexpected error:', error.response?.data || error.message);
      }
    }

    console.log('\n🎉 Authorization endpoint tests completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Run the test
testAuthEndpoints().catch(console.error);
