# Hgraph AI - Simplified MCP Server for Hedera Blockchain

## Overview

Hgraph AI is a streamlined Model Context Protocol (MCP) server that provides AI assistants with direct SQL access to Hedera blockchain data. The server exposes a PostgreSQL database schema and a single execution tool, enabling client LLMs to generate and execute their own SQL queries for maximum flexibility.

## Key Design Philosophy

**Client-Side Intelligence**: Unlike traditional approaches, this MCP server does NOT perform natural language to SQL conversion. Instead, it provides the database schema and lets the client LLM (Claude, GPT, etc.) generate SQL queries directly. This approach:

- Leverages the client LLM's full capabilities
- Eliminates translation layer complexity
- Provides maximum query flexibility
- Reduces server-side dependencies

## Architecture

```
┌─────────────────────────────────────────┐
│     AI Assistant (Claude/GPT/etc)       │
│   [Generates SQL from user questions]   │
└─────────────────────────────────────────┘
                    │
                SQL Query
                    ▼
┌─────────────────────────────────────────┐
│          Hgraph MCP Server              │
│    • execute_query tool                 │
│    • database schema resource           │
└─────────────────────────────────────────┘
                    │
                SQL Execution
                    ▼
┌─────────────────────────────────────────┐
│      PostgreSQL Database                │
│   Hedera Blockchain Mirror Node Data    │
└─────────────────────────────────────────┘
```

## Available Capabilities

### Tool

- **`execute_query`**: Executes SQL queries and returns formatted results
  - Input: SQL query string
  - Output: Query results with execution time and row count

### Resource

- **`hgraph://schema/database`**: Complete PostgreSQL database schema
  - Table definitions
  - Column types and constraints
  - Foreign key relationships

### No Prompts

The server intentionally provides no prompts, allowing client LLMs full control over query generation.

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database with Hedera mirror node data
- Access credentials for the database

### Installation

```bash
# Clone the repository
git clone https://github.com/hgraph/hgraph-ai.git
cd hgraph-ai

# Install dependencies
npm install

# Build the server
npm run build:mcp

# Set up environment variables
cp mcp/.env.example mcp/.env
# Edit .env with your database credentials
```

### Configuration

Create a `.env` file in the `mcp` directory:

```env
# Server Configuration
MCP_PORT=3001

# Database Configuration (REQUIRED)
DB_HOST=your-postgres-host
DB_PORT=5432
DB_DATABASE=hgraph
DB_USERNAME=your-username
DB_PASSWORD=your-password
DB_SSL=true
```

## Usage

### Starting the Server

```bash
# Stdio mode (for Claude Desktop)
npm run dev:mcp

# HTTP mode (for web applications)
npm run dev:mcp-http

# Production mode
npm run build:mcp
npm run start:mcp-http
```

### For Client LLM Developers

When connecting your LLM to this MCP server, follow these patterns for best results:

#### 1. First, Get the Schema

```
User: "What tables are available?"
LLM should: Request the database schema resource
```

#### 2. Generate SQL Queries

```
User: "Show me the top 10 accounts by balance"
LLM should generate:
SELECT account_id, balance
FROM account
ORDER BY balance DESC
LIMIT 10;
```

#### 3. Handle Hedera-Specific Concepts

Important mappings for SQL generation:

- **Account IDs**: Stored as strings like '0.0.123456'
- **Balances**: Stored in tinybars (1 HBAR = 100,000,000 tinybars)
- **Timestamps**: Use `consensus_timestamp` for transaction ordering
- **Token IDs**: Follow same format as account IDs

### Example Query Patterns

#### Account Queries

```sql
-- Get account balance
SELECT account_id, balance, created_timestamp
FROM account
WHERE account_id = '0.0.123456';

-- Top accounts by balance
SELECT account_id, balance / 100000000.0 as hbar_balance
FROM account
ORDER BY balance DESC
LIMIT 10;
```

#### Transaction Queries

```sql
-- Recent transactions for an account
SELECT transaction_id, consensus_timestamp, result, charged_tx_fee
FROM transaction
WHERE payer_account_id = '0.0.123456'
ORDER BY consensus_timestamp DESC
LIMIT 20;

-- Failed transactions in last hour
SELECT * FROM transaction
WHERE result != 'SUCCESS'
  AND consensus_timestamp > NOW() - INTERVAL '1 hour'
LIMIT 100;
```

#### Token Queries

```sql
-- Token balances for an account
SELECT t.token_id, t.name, t.symbol, tb.balance
FROM token_balance tb
JOIN token t ON tb.token_id = t.token_id
WHERE tb.account_id = '0.0.123456';

-- Token transfer history
SELECT * FROM transfer
WHERE token_id = '0.0.456789'
  AND consensus_timestamp > NOW() - INTERVAL '24 hours'
ORDER BY consensus_timestamp DESC;
```

## Common Database Tables

Key tables available in the schema:

- **account**: Account information and balances
- **transaction**: All network transactions
- **transfer**: HBAR and token transfers
- **token**: Token definitions and metadata
- **token_balance**: Current token holdings by account
- **contract**: Smart contract information
- **contract_action**: Contract execution logs
- **topic_message**: HCS topic messages

## Best Practices for Client LLMs

### 1. Always Add LIMIT

```sql
-- Good: Prevents overwhelming results
SELECT * FROM transaction LIMIT 100;

-- Bad: Could return millions of rows
SELECT * FROM transaction;
```

### 2. Use Indexes Efficiently

```sql
-- Good: Uses indexed timestamp column
WHERE consensus_timestamp > '2024-01-01'

-- Less efficient: Function on indexed column
WHERE DATE(consensus_timestamp) = '2024-01-01'
```

### 3. Handle NULL Values

```sql
-- Check for NULL explicitly
WHERE token_id IS NOT NULL
```

### 4. Join Tables Carefully

```sql
-- Good: Specific join conditions
FROM account a
JOIN transaction t ON a.account_id = t.payer_account_id
WHERE a.balance > 0
LIMIT 100;
```

## Error Handling

The server validates queries for safety:

- Only SELECT queries are allowed
- Dangerous keywords (INSERT, UPDATE, DELETE, DROP) are blocked
- Table existence is verified
- Results are limited to prevent overwhelming responses

Common error responses:

- `"Only SELECT queries are allowed"`
- `"Table 'xyz' does not exist in the database"`
- `"Query contains forbidden keyword: DELETE"`

## Development

### Tech Stack

- **Runtime**: Node.js 18+ with TypeScript
- **Protocol**: Model Context Protocol (MCP) 1.0
- **Database**: PostgreSQL
- **Transport**: Stdio and HTTP/SSE

### Project Structure

```
mcp/
├── src/
│   ├── index.ts           # Stdio server entry
│   ├── server-http.ts     # HTTP/SSE server
│   ├── tools/
│   │   └── index.ts       # execute_query tool
│   ├── resources/
│   │   └── index.ts       # Database schema resource
│   └── schema/
│       └── database-schema.json  # Cached schema
├── dist/                  # Compiled output
└── tests/                 # Test suites
```

### Available Scripts

```bash
npm run dev:mcp          # Development stdio server
npm run dev:mcp-http     # Development HTTP server
npm run build:mcp        # Build TypeScript
npm run test             # Run tests
npm run format           # Format code
```

## Tips for Success

### For LLM Implementers

1. **Cache the schema**: Request it once per session
2. **Start simple**: Begin with basic SELECT queries
3. **Build complexity**: Gradually add JOINs and conditions
4. **Use EXPLAIN**: For complex queries, consider EXPLAIN ANALYZE
5. **Handle errors gracefully**: Parse error messages for hints

### Query Optimization

1. **Use specific columns** instead of SELECT \*
2. **Filter early** with WHERE clauses
3. **Limit results** appropriately (default 100 rows)
4. **Use indexes** by filtering on indexed columns
5. **Avoid expensive operations** like large DISTINCT or GROUP BY without limits

## Security

- **Read-only access**: Only SELECT queries permitted
- **Query validation**: All queries are sanitized
- **No credentials**: The server never exposes database credentials
- **Result limiting**: Automatic result size limits

## Support

- Documentation: [docs.hgraph.com](https://docs.hgraph.com)
- MCP Protocol: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- Issues: [GitHub Issues](https://github.com/hgraph/hgraph-ai/issues)

## License

MIT License - see [LICENSE](LICENSE) for details.

## Disclaimer

This MCP server provides read-only access to Hedera blockchain data. Users should verify critical information independently. The client LLM is responsible for generating appropriate SQL queries based on user requests.

---

**Built with ❤️ by the hgraph team**
