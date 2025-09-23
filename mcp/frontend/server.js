import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { MCPHttpClient } from './mcp-http-client.js';
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

${schemaText}

Important Notes:
- Account IDs in format "0.0.X" need to be converted to entity_id format for database queries
- Balances are stored in tinybars (1 HBAR = 100,000,000 tinybars)
- Timestamps are in nanoseconds since epoch
- Always use proper JOINs when querying related tables
- Use the actual table and column names from the schema provided

Generate a PostgreSQL query. Return ONLY JSON:
{
  "sql": "SELECT statement here",
  "description": "What this query does",
  "expectedColumns": ["column1", "column2"]
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
          model: 'claude-opus-4-1-20250805',
          max_tokens: 800,
          temperature: 0.1,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: accountId
                ? `Generate SQL for: ${naturalLanguageQuery}\n\nIMPORTANT: The user's account ID is ${accountId}. When they say "my" or "I", use entity_id = ${accountId.startsWith('0.0.') ? accountId.substring(4) : accountId}`
                : `Generate SQL for: ${naturalLanguageQuery}`,
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

    // If schema is not structured, return as-is
    return `Database Schema:\n${JSON.stringify(schema, null, 2)}`;
  }

  processAccountIds(sql, originalQuery) {
    const accountIdPattern = /\b\d+\.\d+\.\d+\b/g;
    const accountIds = originalQuery.match(accountIdPattern);

    if (!accountIds) return sql;

    let processedSQL = sql;
    accountIds.forEach((accountId) => {
      try {
        const entityId = accountIdToEntityId(accountId);
        processedSQL = processedSQL.replace(
          new RegExp(`'${accountId}'|"${accountId}"|${accountId}`, 'g'),
          entityId,
        );
      } catch (error) {
        console.warn(`Could not convert account ID ${accountId}:`, error);
      }
    });

    return processedSQL;
  }
}

const app = express();
const PORT = process.env.PORT || 3001;
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3002/mcp/message';

// MCP Client instance
let mcpClient = null;

// SQL Generator instance
let sqlGenerator = null;

// Middleware
app.use(
  cors({
    origin: [
      'http://localhost:8080',
      'http://127.0.0.1:8080',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:80',
      'http://127.0.0.1:80',
    ],
    credentials: true,
  }),
);
app.use(express.json());

// Serve static files from the dist directory (production build)
app.use(express.static('dist'));

// Serve static files from the public directory
app.use(express.static('public'));

// Initialize MCP Client
const initializeMCPClient = async () => {
  try {
    console.log('🔌 Initializing MCP client via HTTP...');
    console.log(`URL: ${MCP_SERVER_URL}`);

    // Create and connect HTTP client
    mcpClient = new MCPHttpClient(MCP_SERVER_URL);
    await mcpClient.connect();

    // List available resources, tools, and prompts
    const resources = await mcpClient.listResources();
    const tools = await mcpClient.listTools();
    const prompts = await mcpClient.listPrompts();

    console.log('📋 Available MCP resources:', resources.resources?.length || 0);
    console.log('🔧 Available MCP tools:', tools.tools?.length || 0);
    console.log('💬 Available MCP prompts:', prompts.prompts?.length || 0);

    // Log tool details for debugging
    if (tools.tools && tools.tools.length > 0) {
      console.log('📝 Available tools:');
      tools.tools.forEach((tool) => {
        console.log(`  - ${tool.name}: ${tool.description}`);
      });
    }

    return true;
  } catch (error) {
    console.error('❌ Failed to initialize MCP client:', error.message);
    mcpClient = null;
    return false;
  }
};

// Fetch schema resource from MCP server
const fetchSchemaResource = async () => {
  if (!mcpClient) {
    console.warn('⚠️ MCP client not available for schema fetch');
    return null;
  }

  try {
    console.log('🔍 Fetching database schema from MCP server...');

    // List available resources
    const resources = await mcpClient.listResources();

    if (!resources.resources || resources.resources.length === 0) {
      console.log('📋 No MCP resources available');
      return null;
    }

    // Look for schema-related resources
    const schemaResource = resources.resources.find(
      (resource) =>
        resource.name.toLowerCase().includes('schema') ||
        resource.name.toLowerCase().includes('database') ||
        resource.name.toLowerCase().includes('structure'),
    );

    if (!schemaResource) {
      console.log(
        '📋 Available resources:',
        resources.resources.map((r) => `${r.name} (${r.uri})`).join(', '),
      );
      console.log('📋 No schema resource found, using first available resource');

      // Use the first resource as fallback
      if (resources.resources.length > 0) {
        const firstResource = resources.resources[0];
        console.log(`🔍 Fetching resource: ${firstResource.name}`);

        const resourceContent = await mcpClient.readResource({
          uri: firstResource.uri,
        });

        if (resourceContent && resourceContent.contents && resourceContent.contents.length > 0) {
          const content = resourceContent.contents[0];
          console.log('✅ Schema resource fetched successfully');
          console.log('📄 Resource type:', content.mimeType || 'unknown');

          // Return the schema for use in SQL generation
          if (content.text) {
            try {
              const schema = JSON.parse(content.text);
              console.log(
                '📊 Parsed JSON schema with',
                Object.keys(schema).length,
                'top-level keys',
              );
              return schema;
            } catch (parseError) {
              // If it's not JSON, return as text
              console.log('📝 Returning schema as text:', content.text.length, 'characters');
              return content.text;
            }
          }
        }
      }
      return null;
    }

    console.log(`🔍 Fetching schema resource: ${schemaResource.name} (${schemaResource.uri})`);

    try {
      const resourceContent = await mcpClient.readResource({
        uri: schemaResource.uri,
      });

      console.log(
        '📦 Resource content received:',
        typeof resourceContent,
        Object.keys(resourceContent || {}),
      );

      if (resourceContent && resourceContent.contents && resourceContent.contents.length > 0) {
        const content = resourceContent.contents[0];
        console.log('✅ Schema resource fetched successfully');
        console.log('📄 Resource type:', content.mimeType || 'unknown');
        console.log('📄 Content keys:', Object.keys(content));

        // Return the schema for use in SQL generation
        if (content.text) {
          try {
            const schema = JSON.parse(content.text);
            console.log('📊 Parsed JSON schema with', Object.keys(schema).length, 'top-level keys');
            return schema;
          } catch (parseError) {
            // If it's not JSON, return as text
            console.log('📝 Returning schema as text:', content.text.length, 'characters');
            return content.text;
          }
        } else if (content.blob) {
          console.log('📄 Returning blob data');
          return content.blob;
        }
      }
    } catch (readError) {
      console.warn('⚠️ Failed to read schema resource:', readError.message);

      // Try to use the resource metadata or description instead
      if (schemaResource.description) {
        console.log(
          '📋 Using resource description as schema:',
          schemaResource.description.substring(0, 200) + '...',
        );
        return schemaResource.description;
      } else {
        console.log('📋 Resource info:', JSON.stringify(schemaResource, null, 2));
      }
    }

    return null;
  } catch (error) {
    console.warn('⚠️ Failed to fetch schema resource:', error.message);
    return null;
  }
};

// Query MCP server via HTTP with generated SQL
const queryMCPServer = async (message, conversationHistory = [], accountId = null) => {
  if (!mcpClient || !sqlGenerator) {
    console.warn('⚠️ MCP client or SQL generator not initialized');
    return null;
  }

  try {
    console.log('🔍 Querying MCP server via HTTP with:', message);

    // Fetch fresh schema from MCP server
    console.log('🛠️ Fetching fresh schema from MCP server...');
    const currentSchema = await fetchSchemaResource();

    // Generate SQL query using schema and Claude
    console.log('🛠️ Generating SQL query...');
    console.log(
      '📊 Using schema:',
      currentSchema ? 'Fresh MCP schema resource' : 'No schema available',
    );
    const sqlResult = await sqlGenerator.generateSQL(message, currentSchema, accountId);

    // Replace ? placeholder with actual account ID if provided
    if (accountId && sqlResult.sql.includes('?')) {
      // Convert account ID to entity_id format (remove "0.0." prefix)
      const entityId = accountId.startsWith('0.0.') ? accountId.substring(4) : accountId;
      sqlResult.sql = sqlResult.sql.replace(/\?/g, entityId);
      console.log(`📝 Generated SQL (with account ${accountId} -> ${entityId}):`, sqlResult.sql);
    } else {
      console.log('📝 Generated SQL:', sqlResult.sql);
    }
    console.log('📋 Query description:', sqlResult.description);

    // Try to use available tools first
    const tools = await mcpClient.listTools();

    if (tools.tools && tools.tools.length > 0) {
      // Use the first available tool with generated SQL
      const tool = tools.tools[0];
      console.log(`🔧 Using MCP tool: ${tool.name}`);

      const result = await mcpClient.callTool({
        name: tool.name,
        arguments: {
          sql: sqlResult.sql,
          query: sqlResult.sql,
          description: sqlResult.description,
          message: message,
          text: message,
          question: message,
          account: extractAccountId(message),
        },
      });

      console.log('✅ MCP tool response received');
      console.log(
        '📦 MCP Response content:',
        JSON.stringify(result.content, null, 2).substring(0, 500),
      );

      // Parse the result content to extract query results and actual executed SQL
      let queryResults = null;
      let actualExecutedSQL = null;

      if (result.content && Array.isArray(result.content)) {
        // Look for the content with the actual results
        const resultContent = result.content.find(
          (item) =>
            item.type === 'text' && (item.text.includes('results') || item.text.includes('rows')),
        );
        if (resultContent) {
          queryResults = resultContent.text;

          // Try to extract the actual executed SQL from the results
          const sqlMatch = queryResults.match(/```sql\n([\s\S]*?)\n```/);
          if (sqlMatch) {
            actualExecutedSQL = sqlMatch[1].trim();
          }
        } else if (result.content[0] && result.content[0].text) {
          queryResults = result.content[0].text;
        }
      }

      // Note: The MCP server seems to be using a fallback query instead of our generated SQL
      // The actual SQL we generated is in sqlResult.sql
      console.log('🔍 Our generated SQL:', sqlResult.sql);
      if (actualExecutedSQL && actualExecutedSQL !== sqlResult.sql) {
        console.log('⚠️ MCP executed different SQL:', actualExecutedSQL);
        console.log('📊 This appears to be a fallback query from the MCP server');
      }

      // Create a cleaner results format
      const cleanResults = queryResults
        ? {
            originalQuery: sqlResult.sql,
            executedQuery: actualExecutedSQL || 'Unknown',
            fullResults: queryResults,
          }
        : null;

      return {
        context: result.content,
        toolUsed: tool.name,
        sqlGenerated: sqlResult.sql,
        sqlDescription: sqlResult.description,
        sqlResults: cleanResults ? JSON.stringify(cleanResults, null, 2) : queryResults,
        suggestions: [],
      };
    }

    // Fallback to prompts if no tools available
    const prompts = await mcpClient.listPrompts();
    if (prompts.prompts && prompts.prompts.length > 0) {
      const prompt = prompts.prompts[0];
      console.log(`💬 Using MCP prompt: ${prompt.name}`);

      const result = await mcpClient.getPrompt({
        name: prompt.name,
        arguments: {
          query: message,
        },
      });

      return {
        context: result.messages,
        promptUsed: prompt.name,
        suggestions: [],
      };
    }

    console.warn('⚠️ No MCP tools or prompts available');
    return null;
  } catch (error) {
    console.warn('⚠️ MCP server error:', error.message);
    return null;
  }
};

// Extract account ID from message
const extractAccountId = (message) => {
  const accountPattern = /\b\d+\.\d+\.\d+\b/;
  const match = message.match(accountPattern);
  return match ? match[0] : null;
};

// Health check endpoint
app.get('/health', async (req, res) => {
  const mcpStatus = await checkMCPHealth();
  res.json({
    status: 'ok',
    message: 'Claude API proxy is running',
    mcp: mcpStatus,
  });
});

// MCP Server Data endpoint
app.get('/api/mcp/data', async (req, res) => {
  try {
    if (!mcpClient || !mcpClient.initialized) {
      return res.status(503).json({
        error: 'MCP server not connected',
        tools: [],
        resources: [],
        prompts: []
      });
    }

    // Fetch all available data from MCP server
    const [tools, resources, prompts] = await Promise.all([
      mcpClient.listTools().catch(err => {
        console.warn('Failed to fetch tools:', err);
        return { tools: [] };
      }),
      mcpClient.listResources().catch(err => {
        console.warn('Failed to fetch resources:', err);
        return { resources: [] };
      }),
      mcpClient.listPrompts().catch(err => {
        console.warn('Failed to fetch prompts:', err);
        return { prompts: [] };
      })
    ]);

    res.json({
      status: 'connected',
      tools: tools.tools || [],
      resources: resources.resources || [],
      prompts: prompts.prompts || []
    });
  } catch (error) {
    console.error('Error fetching MCP data:', error);
    res.status(500).json({
      error: 'Failed to fetch MCP data',
      tools: [],
      resources: [],
      prompts: []
    });
  }
});

const checkMCPHealth = async () => {
  return mcpClient && mcpClient.initialized ? 'connected' : 'disconnected';
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

    // Query MCP server for additional context
    const mcpData = await queryMCPServer(message, conversationHistory, accountId);

    // Enhance system prompt with MCP data
    let enhancedSystemPrompt =
      systemPrompt || 'You are an AI assistant specialized in analyzing Hedera blockchain data.';

    if (mcpData && mcpData.context) {
      enhancedSystemPrompt += `\n\nAdditional context from Hedera blockchain data:\n${JSON.stringify(
        mcpData.context,
        null,
        2,
      )}`;
    }

    if (mcpData && mcpData.suggestions) {
      enhancedSystemPrompt += `\n\nRelevant data suggestions: ${mcpData.suggestions.join(', ')}`;
    }

    // Prepare messages for Claude API
    const messages = [...conversationHistory, { role: 'user', content: message }];

    // Call Claude API
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-1-20250805',
        max_tokens: 4096,
        temperature: 0.7,
        system: enhancedSystemPrompt,
        messages: messages,
      }),
    });

    if (!claudeResponse.ok) {
      const errorData = await claudeResponse.json().catch(() => ({}));
      console.error('Claude API Error:', claudeResponse.status, errorData);

      // Provide user-friendly error messages based on error type
      let userMessage = errorData.error?.message || `Claude API returned ${claudeResponse.status}`;
      const errorType = errorData.error?.type;

      // Handle specific error types with better messages
      if (claudeResponse.status === 529 || errorType === 'overloaded_error') {
        userMessage =
          'Claude is currently experiencing high traffic. Please wait a moment and try again. Your query has not been lost.';
      } else if (claudeResponse.status === 401 || errorType === 'authentication_error') {
        userMessage = 'Authentication failed. Please check your API key configuration.';
      } else if (claudeResponse.status === 429 || errorType === 'rate_limit_error') {
        userMessage = 'Rate limit exceeded. Please wait a few seconds before trying again.';
      } else if (claudeResponse.status === 500 || errorType === 'internal_server_error') {
        userMessage =
          'Claude is experiencing technical difficulties. Please try again in a few moments.';
      } else if (claudeResponse.status === 503 || errorType === 'service_unavailable') {
        userMessage = 'Claude service is temporarily unavailable. Please try again later.';
      } else if (errorType === 'invalid_request_error') {
        userMessage = 'Your request could not be processed. Please try rephrasing your question.';
      }

      return res.status(claudeResponse.status).json({
        error: userMessage,
        type: errorType || 'api_error',
        retryable: [429, 500, 502, 503, 529].includes(claudeResponse.status),
      });
    }

    const data = await claudeResponse.json();

    // Extract text response
    let responseText = 'No response from Claude';
    if (data.content && Array.isArray(data.content) && data.content.length > 0) {
      const textContent = data.content.find((item) => item.type === 'text');
      if (textContent && textContent.text) {
        responseText = textContent.text;
      }
    }

    res.json({
      response: responseText,
      usage: data.usage || {},
      model: data.model || 'claude-opus-4-1-20250805',
      mcpData: mcpData
        ? {
            hasContext: !!mcpData.context,
            suggestions: mcpData.suggestions || [],
            sqlQuery: mcpData.sqlGenerated || null,
            queryDescription: mcpData.sqlDescription || null,
            queryResults: mcpData.sqlResults || null,
          }
        : null,
    });
  } catch (error) {
    console.error('Server Error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

// Catch-all route for client-side routing - must be after API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Claude API proxy running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  console.log(`🤖 Claude API endpoint: http://localhost:${PORT}/api/claude`);

  // Initialize SQL Generator
  const claudeApiKey = process.env.CLAUDE_API_KEY;
  if (claudeApiKey) {
    sqlGenerator = new SQLGenerator(claudeApiKey);
    console.log('🛠️ SQL Generator initialized');
  } else {
    console.warn('⚠️ Claude API key not found - SQL generation disabled');
  }

  // Initialize MCP client
  await initializeMCPClient();
});
