#!/usr/bin/env tsx

/**
 * OAuth 2.1 Flow Tests for MCP Server
 * Tests Authorization Code + PKCE and Client Credentials flows
 */

import axios from 'axios';
import crypto from 'crypto';
import { generateCodeVerifier, generateCodeChallenge } from '../src/auth/oauth-routes.js';

const MCP_BASE_URL = process.env.MCP_URL || 'http://localhost:3001';
const KEYCLOAK_BASE_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const KEYCLOAK_REALM = 'mcp';

// Test clients from realm configuration
const PUBLIC_CLIENT = {
  clientId: 'mcp-public-client',
  redirectUri: 'http://localhost:3001/auth/callback',
};

const SERVICE_CLIENT = {
  clientId: 'mcp-service-client',
  clientSecret: 'mcp-service-secret',
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message: string, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function testDiscoveryEndpoint() {
  log('\n=== Testing Discovery Endpoint ===', colors.blue);
  
  try {
    const response = await axios.get(`${MCP_BASE_URL}/.well-known/oauth-authorization-server`);
    
    const required = ['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri'];
    const missing = required.filter(field => !response.data[field]);
    
    if (missing.length === 0) {
      log('✓ Discovery endpoint returned all required fields', colors.green);
      log(`  Issuer: ${response.data.issuer}`);
      log(`  Auth endpoint: ${response.data.authorization_endpoint}`);
      log(`  Token endpoint: ${response.data.token_endpoint}`);
      log(`  JWKS URI: ${response.data.jwks_uri}`);
      return true;
    } else {
      log(`✗ Discovery endpoint missing fields: ${missing.join(', ')}`, colors.red);
      return false;
    }
  } catch (error: any) {
    log(`✗ Discovery endpoint failed: ${error.message}`, colors.red);
    return false;
  }
}

async function testClientCredentialsFlow() {
  log('\n=== Testing Client Credentials Flow ===', colors.blue);
  
  try {
    // Step 1: Get token using client credentials
    log('1. Requesting token with client credentials...');
    const tokenResponse = await axios.post(
      `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: SERVICE_CLIENT.clientId,
        client_secret: SERVICE_CLIENT.clientSecret,
        scope: 'mcp.read mcp.write',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    
    const { access_token, expires_in, token_type } = tokenResponse.data;
    log(`✓ Received access token (expires in ${expires_in}s)`, colors.green);
    
    // Step 2: Use token to call MCP API
    log('2. Calling MCP API with access token...');
    const apiResponse = await axios.post(
      `${MCP_BASE_URL}/mcp/message`,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      },
      {
        headers: {
          'Authorization': `${token_type} ${access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (apiResponse.data.result?.tools) {
      log(`✓ API call successful, received ${apiResponse.data.result.tools.length} tools`, colors.green);
      return true;
    } else {
      log('✗ API call returned unexpected response', colors.red);
      return false;
    }
  } catch (error: any) {
    log(`✗ Client credentials flow failed: ${error.response?.data?.error || error.message}`, colors.red);
    if (error.response?.data) {
      console.log('Error details:', error.response.data);
    }
    return false;
  }
}

async function testPKCEFlow() {
  log('\n=== Testing Authorization Code + PKCE Flow ===', colors.blue);
  log('(Manual test - requires browser interaction)', colors.yellow);
  
  // Generate PKCE challenge
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = crypto.randomBytes(16).toString('hex');
  
  log('1. PKCE parameters generated:');
  log(`   Code verifier: ${codeVerifier.substring(0, 20)}...`);
  log(`   Code challenge: ${codeChallenge.substring(0, 20)}...`);
  log(`   State: ${state}`);
  
  // Build authorization URL
  const authParams = new URLSearchParams({
    response_type: 'code',
    client_id: PUBLIC_CLIENT.clientId,
    redirect_uri: PUBLIC_CLIENT.redirectUri,
    scope: 'openid profile email mcp.read',
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  
  const authUrl = `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/auth?${authParams}`;
  
  log('\n2. To test PKCE flow manually:');
  log(`   a. Open this URL in your browser:\n      ${authUrl}`);
  log('   b. Login with test credentials (test-user / test123)');
  log('   c. You will be redirected to the callback with a code');
  log('   d. Use the code to exchange for tokens');
  
  // Provide example token exchange
  log('\n3. Example token exchange command:');
  log(`curl -X POST ${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=authorization_code" \\
  -d "code=<CODE_FROM_CALLBACK>" \\
  -d "redirect_uri=${PUBLIC_CLIENT.redirectUri}" \\
  -d "client_id=${PUBLIC_CLIENT.clientId}" \\
  -d "code_verifier=${codeVerifier}"`);
  
  return true;
}

async function testUnauthorizedAccess() {
  log('\n=== Testing Unauthorized Access ===', colors.blue);
  
  const tests = [
    {
      name: 'No authorization header',
      headers: {},
      expectedError: 'invalid_request',
    },
    {
      name: 'Invalid token format',
      headers: { 'Authorization': 'InvalidFormat token' },
      expectedError: 'invalid_request',
    },
    {
      name: 'Expired/invalid JWT',
      headers: { 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c' },
      expectedError: 'invalid_token',
    },
  ];
  
  let allPassed = true;
  
  for (const test of tests) {
    try {
      await axios.post(
        `${MCP_BASE_URL}/mcp/message`,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        },
        {
          headers: {
            'Content-Type': 'application/json',
            ...test.headers,
          },
        }
      );
      
      log(`✗ ${test.name}: Expected 401 but request succeeded`, colors.red);
      allPassed = false;
    } catch (error: any) {
      if (error.response?.status === 401) {
        const authHeader = error.response.headers['www-authenticate'];
        if (authHeader && authHeader.includes(test.expectedError)) {
          log(`✓ ${test.name}: Correctly rejected with 401 and ${test.expectedError}`, colors.green);
        } else {
          log(`✗ ${test.name}: Got 401 but wrong error type`, colors.red);
          allPassed = false;
        }
      } else {
        log(`✗ ${test.name}: Unexpected error: ${error.message}`, colors.red);
        allPassed = false;
      }
    }
  }
  
  return allPassed;
}

async function testScopeEnforcement() {
  log('\n=== Testing Scope Enforcement ===', colors.blue);
  
  try {
    // Get token with limited scope (read only)
    log('1. Requesting token with read-only scope...');
    const tokenResponse = await axios.post(
      `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: SERVICE_CLIENT.clientId,
        client_secret: SERVICE_CLIENT.clientSecret,
        scope: 'mcp.read', // Read only
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    
    const { access_token } = tokenResponse.data;
    
    // Try read operation (should succeed)
    log('2. Testing read operation with read-only token...');
    try {
      await axios.post(
        `${MCP_BASE_URL}/mcp/message`,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        },
        {
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      log('✓ Read operation succeeded with read-only token', colors.green);
    } catch (error) {
      log('✗ Read operation failed with read-only token', colors.red);
      return false;
    }
    
    // Try write operation (should fail with 403)
    log('3. Testing write operation with read-only token...');
    try {
      await axios.post(
        `${MCP_BASE_URL}/mcp/message`,
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'execute_query',
            arguments: { query: 'SELECT 1' },
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      log('✗ Write operation should have been rejected', colors.red);
      return false;
    } catch (error: any) {
      if (error.response?.status === 403 || 
          error.response?.data?.error?.code === -32002) {
        log('✓ Write operation correctly rejected with insufficient scope', colors.green);
        return true;
      } else {
        log(`✗ Unexpected error: ${error.message}`, colors.red);
        return false;
      }
    }
  } catch (error: any) {
    log(`✗ Scope enforcement test failed: ${error.message}`, colors.red);
    return false;
  }
}

async function testHealthCheck() {
  log('\n=== Testing Health Check ===', colors.blue);
  
  try {
    const response = await axios.get(`${MCP_BASE_URL}/health/auth`);
    
    log('Health check response:', colors.green);
    log(`  Mode: ${response.data.mode}`);
    log(`  OAuth enabled: ${response.data.oauth_enabled}`);
    log(`  JWKS status: ${response.data.jwks_status}`);
    log(`  Keycloak status: ${response.data.keycloak_status || 'N/A'}`);
    
    return response.status === 200;
  } catch (error: any) {
    log(`✗ Health check failed: ${error.message}`, colors.red);
    return false;
  }
}

async function main() {
  log('================================================', colors.blue);
  log('MCP OAuth 2.1 Flow Tests', colors.blue);
  log('================================================', colors.blue);
  
  log(`\nMCP Server: ${MCP_BASE_URL}`);
  log(`Keycloak: ${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}`);
  
  const results: Record<string, boolean> = {};
  
  // Run tests
  results['Discovery'] = await testDiscoveryEndpoint();
  results['Health Check'] = await testHealthCheck();
  results['Client Credentials'] = await testClientCredentialsFlow();
  results['Unauthorized Access'] = await testUnauthorizedAccess();
  results['Scope Enforcement'] = await testScopeEnforcement();
  results['PKCE Flow'] = await testPKCEFlow();
  
  // Summary
  log('\n================================================', colors.blue);
  log('Test Summary', colors.blue);
  log('================================================', colors.blue);
  
  let allPassed = true;
  for (const [test, passed] of Object.entries(results)) {
    const icon = passed ? '✓' : '✗';
    const color = passed ? colors.green : colors.red;
    log(`${icon} ${test}`, color);
    if (!passed) allPassed = false;
  }
  
  if (allPassed) {
    log('\nAll tests passed! 🎉', colors.green);
  } else {
    log('\nSome tests failed. Check the logs above.', colors.red);
    process.exit(1);
  }
}

main().catch((error) => {
  log(`\nTest suite error: ${error.message}`, colors.red);
  process.exit(1);
});