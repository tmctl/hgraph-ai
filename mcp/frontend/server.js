import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
// Load environment variables
dotenv.config();

// Get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SQL Generation utilities
const accountIdToEntityId = (accountId) => {
  const parts = accountId.split('.');
  if (parts.length !== 3) throw new Error('Invalid account ID format');

  const [shard, realm, num] = parts.map(Number);
  return ((BigInt(shard) << 32n) | (BigInt(realm) << 16n) | BigInt(num)).toString();
};

class SQLGenerator {
  constructor(claudeApiKey) {
    this.claudeApiKey = claudeApiKey;
  }

  async generateSQL(naturalLanguageQuery, schema = null, accountId = null) {
    if (!schema) {
      throw new Error('Schema is required for SQL generation');
    }

    const schemaText = this.formatSchemaForPrompt(schema);

    const systemPrompt = `You are an expert SQL generator for Hedera blockchain data.
The user is asking: "${naturalLanguageQuery}"

${schemaText}

CRITICAL: The database uses entity_id (bigint) instead of account_id strings for all account references.
Account IDs like "0.0.12345" must be converted to entity_id format.
${accountId ? `\nThe user's account is: ${accountId} (entity_id: ${accountIdToEntityId(accountId)})` : ''}

Requirements:
1. Generate ONLY valid SQL queries
2. Use entity_id for all account-related WHERE clauses
3. Include appropriate JOINs when querying related tables
4. Order results by timestamp DESC by default for time-series data
5. Limit results to 100 unless specified otherwise
6. Use proper date/time functions for timestamp columns

Return response as JSON:
{
  "sql": "the SQL query",
  "explanation": "brief explanation of what the query does"
}`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.claudeApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          temperature: 0,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: naturalLanguageQuery,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`);
      }

      const data = await response.json();
      const responseText = data.content?.[0]?.text;

      if (!responseText) {
        throw new Error('No response from Claude');
      }

      // Parse JSON response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not parse SQL response');
      }

      const result = JSON.parse(jsonMatch[0]);

      // Convert account IDs to entity_id format
      result.sql = this.processAccountIds(result.sql, naturalLanguageQuery);

      return result;
    } catch (error) {
      console.error('SQL generation error:', error);
      throw error; // Don't use fallback, require schema
    }
  }

  formatSchemaForPrompt(schema) {
    if (typeof schema === 'string') {
      return `Database Schema:\n${schema}`;
    }

    if (schema && schema.tables) {
      let schemaText = 'Database Schema:\n';
      for (const [tableName, table] of Object.entries(schema.tables)) {
        schemaText += `\nTable: ${tableName}\n`;
        if (table.description) {
          schemaText += `Description: ${table.description}\n`;
        }
        if (table.columns) {
          schemaText += 'Columns:\n';
          for (const [colName, col] of Object.entries(table.columns)) {
            schemaText += `  - ${colName} (${col.type || 'unknown'}): ${
              col.description || 'no description'
            }\n`;
          }
        }
      }
      return schemaText;
    }

    return `Database Schema:\n${JSON.stringify(schema, null, 2)}`;
  }

  processAccountIds(sql, query) {
    // Find account IDs in format x.y.z and convert them
    const accountIdPattern = /['"]?\b(\d+)\.(\d+)\.(\d+)\b['"]?/g;
    const matches = Array.from(query.matchAll(accountIdPattern));

    let processedSql = sql;
    matches.forEach((match) => {
      const fullAccountId = match[0].replace(/['"]/g, '');
      try {
        const entityId = accountIdToEntityId(fullAccountId);
        // Replace in SQL, handling both quoted and unquoted versions
        processedSql = processedSql.replace(
          new RegExp(`['"]?${fullAccountId.replace(/\./g, '\\.')}['"]?`, 'g'),
          entityId,
        );
      } catch (error) {
        console.warn(`Failed to convert account ID ${fullAccountId}:`, error);
      }
    });

    return processedSql;
  }
}

const app = express();
const PORT = process.env.PORT || 3001;

// SQL Generator instance
let sqlGenerator = null;

// Configure CORS
const CORS_ORIGINS = process.env.CORS_ORIGINS?.split(',') || [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://localhost:8080'
];

app.use(
  cors({
    origin: CORS_ORIGINS,
    credentials: true,
  })
);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from the dist directory (Vite build output)
app.use(express.static('dist'));

// Serve static files from the public directory
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'hgraph-mcp-frontend-server',
    mcp: 'oauth-protected'
  });
});

// MCP Status endpoint
app.get('/api/mcp/status', async (req, res) => {
  const mcpStatus = await checkMCPHealth();
  res.json({
    mcp: mcpStatus,
  });
});

// MCP Server Data endpoint - Requires OAuth authentication
app.get('/api/mcp/data', async (req, res) => {
  try {
    // Check for OAuth token in Authorization header
    const authHeader = req.headers.authorization;
    const oauthToken = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : null;

    // Require OAuth token - no fallback to unauthenticated access
    if (!oauthToken) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please login to access MCP server data',
        tools: [],
        resources: [],
        prompts: []
      });
    }

    // Fetch from OAuth-enabled MCP server
    if (oauthToken) {
      try {
        console.log('🔐 User authenticated, fetching MCP data with service token');

        // Get a service token with proper scopes
        // Use Docker service name when running in container, localhost otherwise
        const keycloakUrl = process.env.KEYCLOAK_URL || 'http://keycloak:8080';
        const tokenResponse = await fetch(`${keycloakUrl}/realms/mcp/protocol/openid-connect/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: 'grant_type=client_credentials&client_id=mcp-api&client_secret=mcp-api-secret&scope=mcp.read%20mcp.write'
        });

        if (!tokenResponse.ok) {
          throw new Error('Failed to get service token');
        }

        const tokenData = await tokenResponse.json();
        const serviceToken = tokenData.access_token;

        // Make authenticated request to MCP server
        // Use Docker service name when running in container
        const mcpServerUrl = process.env.MCP_SERVER_URL || 'http://mcp-server:3001';

        // Fetch tools, resources, and prompts in parallel
        const [toolsResponse, resourcesResponse, promptsResponse] = await Promise.allSettled([
          fetch(`${mcpServerUrl}/mcp/message`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'tools/list',
            }),
          }),
          fetch(`${mcpServerUrl}/mcp/message`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              method: 'resources/list',
            }),
          }),
          fetch(`${mcpServerUrl}/mcp/message`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 3,
              method: 'prompts/list',
            }),
          }),
        ]);

        // Parse responses
        const tools = toolsResponse.status === 'fulfilled' && toolsResponse.value.ok
          ? (await toolsResponse.value.json()).result?.tools || []
          : [];

        const resources = resourcesResponse.status === 'fulfilled' && resourcesResponse.value.ok
          ? (await resourcesResponse.value.json()).result?.resources || []
          : [];

        const prompts = promptsResponse.status === 'fulfilled' && promptsResponse.value.ok
          ? (await promptsResponse.value.json()).result?.prompts || []
          : [];

        console.log(`✅ OAuth fetch successful - Tools: ${tools.length}, Resources: ${resources.length}, Prompts: ${prompts.length}`);

        return res.json({
          status: 'authenticated',
          tools,
          resources,
          prompts,
        });
      } catch (err) {
        console.error('⚠️ OAuth fetch failed:', err);
        return res.status(503).json({
          error: 'Failed to fetch MCP data',
          message: 'Unable to connect to MCP server. Please try again later.',
          tools: [],
          resources: [],
          prompts: []
        });
      }
    }
  } catch (error) {
    console.error('Error in MCP data endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching MCP data',
      tools: [],
      resources: [],
      prompts: []
    });
  }
});

const checkMCPHealth = async () => {
  // Check OAuth-protected MCP server health
  try {
    const mcpServerUrl = process.env.MCP_SERVER_URL || 'http://mcp-server:3001';
    const response = await fetch(`${mcpServerUrl}/health`);
    return response.ok ? 'connected' : 'disconnected';
  } catch {
    return 'disconnected';
  }
};

// Claude API proxy endpoint
app.post('/api/claude', async (req, res) => {
  try {
    const { message, conversationHistory = [], systemPrompt, accountId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const claudeApiKey = process.env.CLAUDE_API_KEY;
    if (!claudeApiKey) {
      return res.status(500).json({ error: 'Claude API key not configured' });
    }

    // Build messages array from conversation history
    const messages = [];

    // Add conversation history if provided
    if (conversationHistory && conversationHistory.length > 0) {
      conversationHistory.forEach((msg) => {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      });
    }

    // Add current message
    messages.push({
      role: 'user',
      content: message,
    });

    // Make request to Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
        max_tokens: parseInt(process.env.CLAUDE_MAX_TOKENS) || 4096,
        temperature: parseFloat(process.env.CLAUDE_TEMPERATURE) || 0.7,
        system:
          systemPrompt ||
          `You are a helpful AI assistant with expertise in blockchain technology, specifically the Hedera network.
You can help users understand and query Hedera blockchain data, explain transactions, accounts, tokens, and smart contracts.
When providing SQL queries, always use proper entity_id format for account references.
Be concise but thorough in your explanations.`,
        messages: messages,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Claude API error:', errorData);
      return res.status(response.status).json({
        error: 'Failed to get response from Claude',
        details: errorData,
      });
    }

    const data = await response.json();

    // Extract the response text
    const responseText = data.content?.[0]?.text;

    if (!responseText) {
      return res.status(500).json({ error: 'No response from Claude' });
    }

    res.json({
      response: responseText,
      usage: data.usage,
    });
  } catch (error) {
    console.error('Error in Claude API proxy:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

// SQL generation endpoint
app.post('/api/generate-sql', async (req, res) => {
  try {
    const { query, schema, accountId } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    if (!sqlGenerator) {
      return res.status(503).json({
        error: 'SQL generation not available',
        message: 'Claude API key not configured',
      });
    }

    const result = await sqlGenerator.generateSQL(query, schema, accountId);
    res.json(result);
  } catch (error) {
    console.error('Error in SQL generation:', error);
    res.status(500).json({
      error: 'Failed to generate SQL',
      message: error.message,
    });
  }
});

// Fallback to serve index.html for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);

  // Initialize SQL generator if Claude API key is present
  if (process.env.CLAUDE_API_KEY) {
    sqlGenerator = new SQLGenerator(process.env.CLAUDE_API_KEY);
    console.log('✅ SQL generator initialized');
  } else {
    console.warn('⚠️ Claude API key not found - SQL generation disabled');
  }

  // MCP client initialization removed - using OAuth-protected server only
});