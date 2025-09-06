#!/usr/bin/env tsx

/**
 * Test script for MCP HTTP authorization
 */

import axios from 'axios';

const BASE_URL = process.env.MCP_URL || 'http://localhost:3001/mcp';
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN || 'test-token-12345';

async function testWithoutAuth() {
  console.log('\n1. Testing without authorization header...');
  try {
    const response = await axios.post(`${BASE_URL}/message`, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    console.log('✓ Request succeeded (auth might be disabled)');
    console.log('Response:', response.data);
  } catch (error: any) {
    if (error.response?.status === 401) {
      console.log('✓ Correctly rejected with 401 Unauthorized');
      console.log('Error:', error.response.data);
    } else {
      console.error('✗ Unexpected error:', error.message);
    }
  }
}

async function testWithInvalidAuth() {
  console.log('\n2. Testing with invalid authorization header...');
  try {
    const response = await axios.post(
      `${BASE_URL}/message`,
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      },
      {
        headers: {
          Authorization: 'InvalidFormat token',
        },
      },
    );
    console.log('✗ Request should have been rejected');
    console.log('Response:', response.data);
  } catch (error: any) {
    if (error.response?.status === 401) {
      console.log('✓ Correctly rejected with 401 Unauthorized');
      console.log('Error:', error.response.data);
    } else {
      console.error('✗ Unexpected error:', error.message);
    }
  }
}

async function testWithWrongToken() {
  console.log('\n3. Testing with wrong Bearer token...');
  try {
    const response = await axios.post(
      `${BASE_URL}/message`,
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/list',
        params: {},
      },
      {
        headers: {
          Authorization: 'Bearer wrong-token',
        },
      },
    );
    console.log('✗ Request should have been rejected');
    console.log('Response:', response.data);
  } catch (error: any) {
    if (error.response?.status === 401) {
      console.log('✓ Correctly rejected with 401 Unauthorized');
      console.log('Error:', error.response.data);
    } else {
      console.error('✗ Unexpected error:', error.message);
    }
  }
}

async function testWithValidAuth() {
  console.log('\n4. Testing with valid Bearer token...');
  try {
    const response = await axios.post(
      `${BASE_URL}/message`,
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/list',
        params: {},
      },
      {
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
        },
      },
    );
    console.log('✓ Request succeeded with valid authorization');
    console.log('Tools available:', response.data.result?.tools?.length || 0);
  } catch (error: any) {
    if (error.response?.status === 401) {
      console.log('✗ Request rejected (check if token matches MCP_AUTH_TOKEN)');
      console.log('Error:', error.response.data);
    } else {
      console.error('✗ Unexpected error:', error.message);
    }
  }
}

async function testSSEWithAuth() {
  console.log('\n5. Testing SSE endpoint with authorization...');
  try {
    const response = await axios.get(`${BASE_URL}/sse`, {
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        Accept: 'text/event-stream',
      },
      responseType: 'stream',
      timeout: 2000,
    });
    console.log('✓ SSE connection established with authorization');
    response.data.destroy(); // Close the stream
  } catch (error: any) {
    if (error.response?.status === 401) {
      console.log('✗ SSE rejected (authorization required)');
    } else if (error.code === 'ECONNABORTED') {
      console.log('✓ SSE connection established (timed out as expected)');
    } else {
      console.error('✗ Unexpected error:', error.message);
    }
  }
}

async function testBatchWithAuth() {
  console.log('\n6. Testing batch endpoint with authorization...');
  try {
    const response = await axios.post(
      `${BASE_URL}/batch`,
      [
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/list',
          params: {},
        },
        {
          jsonrpc: '2.0',
          id: 6,
          method: 'prompts/list',
          params: {},
        },
      ],
      {
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
        },
      },
    );
    console.log('✓ Batch request succeeded with valid authorization');
    console.log('Responses received:', response.data.length);
  } catch (error: any) {
    if (error.response?.status === 401) {
      console.log('✗ Batch request rejected (check authorization)');
      console.log('Error:', error.response.data);
    } else {
      console.error('✗ Unexpected error:', error.message);
    }
  }
}

async function main() {
  console.log('==============================================');
  console.log('MCP HTTP Authorization Test');
  console.log('==============================================');
  console.log(`Testing server at: ${BASE_URL}`);
  console.log(`Using token: ${AUTH_TOKEN}`);
  console.log('');
  console.log('To test with authorization enabled:');
  console.log('1. Set MCP_AUTH_ENABLED=true in your .env file');
  console.log(`2. Set MCP_AUTH_TOKEN=${AUTH_TOKEN} in your .env file`);
  console.log('3. Restart the MCP server');
  console.log('4. Run this test script');
  console.log('==============================================');

  await testWithoutAuth();
  await testWithInvalidAuth();
  await testWithWrongToken();
  await testWithValidAuth();
  await testSSEWithAuth();
  await testBatchWithAuth();

  console.log('\n==============================================');
  console.log('Test completed');
  console.log('==============================================');
}

main().catch(console.error);
