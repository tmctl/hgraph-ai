#!/usr/bin/env node

import { getIntrospectionQuery } from 'graphql';
import { GraphQLClient } from 'graphql-request';

const HGRAPH_GRAPHQL_ENDPOINT =
  process.env.HGRAPH_GRAPHQL_URL || 'https://mainnet.hedera.api.hgraph.io/v1/graphql';
const HGRAPH_API_KEY = process.env.HGRAPH_API_KEY;

const client = new GraphQLClient(HGRAPH_GRAPHQL_ENDPOINT, {
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'Hgraph-MCP-Server/1.0',
    ...(HGRAPH_API_KEY && { Authorization: `Bearer ${HGRAPH_API_KEY}` }),
  },
});

async function testIntrospection() {
  try {
    console.log('Testing GraphQL introspection...');
    console.log('Endpoint:', HGRAPH_GRAPHQL_ENDPOINT);

    const introspectionQuery = getIntrospectionQuery();
    const response = await client.request(introspectionQuery);

    // Check if we got schema data
    const schemaData = response.__schema || response.data || response;

    if (schemaData && schemaData.types) {
      console.log('✅ Introspection successful!');
      console.log(`Found ${schemaData.types.length} types in schema`);

      // List some key types
      const keyTypes = schemaData.types
        .filter((t) => !t.name.startsWith('__'))
        .slice(0, 10)
        .map((t) => t.name);

      console.log('Sample types:', keyTypes.join(', '));
    } else {
      console.error('❌ No schema data found in response');
    }
  } catch (error) {
    console.error('❌ Introspection failed:', error.message);
    if (error.response) {
      console.error('Response:', JSON.stringify(error.response, null, 2));
    }
  }
}

testIntrospection();
