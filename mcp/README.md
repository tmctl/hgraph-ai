# Hgraph MCP Server

A Model Context Protocol (MCP) server for accessing Hedera blockchain data through Hgraph's APIs. This server follows MCP best practices by returning processed data rather than raw queries, ensuring security, abstraction, and proper data validation.

## Features

### Primary Interfaces

- **GraphQL API**: Execute GraphQL queries and return processed data from Hgraph's API
- **JSON-RPC API**: Ethereum-compatible JSON-RPC methods for blockchain interaction
- **REST API**: Direct access to account, transaction, token, and network data
- **Schema Introspection**: Discover available GraphQL types and fields
- **Data Validation**: All responses are validated and formatted server-side

### JSON-RPC Methods (Beta)

- **eth_chainId**: Get the chain ID of the current network
- **eth_getBlockByNumber**: Retrieve block information by block number
- **eth_getTransactionByHash**: Get transaction details by hash
- **eth_call**: Execute smart contract calls without creating transactions
- **eth_sendRawTransaction**: Send signed transactions to the network

### REST API Support

- **Account Information**: Get detailed account data including HBAR balance, keys, and staking information
- **Transaction History**: Query transaction history with configurable limits and sorting
- **Token Balances**: Retrieve fungible and non-fungible token holdings for any account
- **Network Statistics**: Access network-wide metrics including node information and HBAR supply

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd hgraph-mcp-server

# Install dependencies
npm install

# Build the TypeScript code
npm run build
```

## Configuration

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Configure the following environment variables:

### Server Configuration

- `MCP_PORT`: Port for HTTP server mode (default: 3000)

### GraphQL Configuration

- `HGRAPH_GRAPHQL_URL`: Hgraph GraphQL API endpoint (default: https://mainnet.hedera.api.hgraph.io/v1/graphql)
- `HGRAPH_API_KEY`: Your Hgraph API key (required for GraphQL access)

### Security Note

This MCP server follows security best practices:

- No direct SQL query execution exposed
- All data access is handled server-side
- Responses are validated and sanitized
- Only read operations are supported

### REST API Configuration

- `HGRAPH_REST_URL`: Hgraph REST API endpoint (default: https://mainnet.hedera.api.hgraph.io/v1/pk_prod_ab2c41b848c0b568e96a31ef0ca2f2fbaa549470/api/v1)

### JSON-RPC Configuration

- `HGRAPH_NETWORK`: Network to use (mainnet/testnet, default: mainnet)
- `HGRAPH_API_KEY`: Your Hgraph API key (required for JSON-RPC access)

## Usage

### Running the Server

The MCP server can run in three modes:

#### 1. Stdio Mode (for MCP clients)

```bash
# Development mode
npm run dev

# Production mode
npm run build && npm start
```

#### 2. HTTP Server Mode (for REST API access)

```bash
# Development mode (runs on port 3000 by default)
npm run dev:mcp-server

# Production mode
npm run build && npm run start:mcp-server

# Or with custom port
MCP_PORT=8080 npm run dev:mcp-server
```

#### 3. Streamable HTTP Mode (with Server-Sent Events)

The server now supports the MCP Streamable HTTP transport specification, providing both request-response and streaming capabilities via Server-Sent Events (SSE).

```bash
# Development mode (runs on port 3001 by default)
npm run dev:http

# Production mode
npm run build && npm run start:http

# Or with custom configuration
MCP_PORT=3001 MCP_HOST=localhost npm run dev:http
```

**Configuration:**
- `MCP_PORT`: Server port (default: 3001)
- `MCP_HOST`: Server host (default: localhost)
- `MCP_CORS_ORIGIN`: CORS origin configuration (default: *)
- `MCP_API_PREFIX`: API path prefix (default: /mcp)

**Endpoints:**
- `GET /mcp/health` - Health check and server status
- `GET /mcp/sse` - Server-Sent Events stream for real-time updates
- `POST /mcp/message` - Single JSON-RPC request endpoint
- `POST /mcp/batch` - Batch JSON-RPC requests

**Testing the Streamable HTTP Server:**

```bash
# Check server health
curl http://localhost:3001/mcp/health

# Connect to SSE stream (will stream events)
curl -N http://localhost:3001/mcp/sse

# Send a JSON-RPC request
curl -X POST http://localhost:3001/mcp/message \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Send batch requests
curl -X POST http://localhost:3001/mcp/batch \
  -H "Content-Type: application/json" \
  -d '[
    {"jsonrpc":"2.0","id":1,"method":"tools/list"},
    {"jsonrpc":"2.0","id":2,"method":"resources/list"}
  ]'

# Run the test client
npm run test:http-client
```

**Features:**
- Full MCP protocol support over HTTP
- Server-Sent Events for streaming responses
- Batch request processing
- Automatic heartbeat to maintain connections
- CORS support for browser-based clients
- Connection management and timeout handling

### HTTP API Endpoints

When running in HTTP server mode, the following REST endpoints are available:

- `GET /health` - Health check endpoint
- `GET /tools` - List all available tools
- `POST /execute` - Execute any tool with generic interface

#### GraphQL Endpoints

- `POST /graphql/execute` - Execute GraphQL query
- `GET /graphql/schema` - Get GraphQL schema
- `POST /graphql/refresh-schema` - Refresh schema from server
- `POST /graphql/query-template` - Get query template

#### Account Endpoints

- `GET /account/:accountId` - Get account information
- `GET /account/:accountId/transactions` - Get transaction history
- `GET /account/:accountId/tokens` - Get token balances

#### Network Endpoints

- `GET /network/stats` - Get network statistics

#### Database Endpoints

- `POST /database/ask` - Ask a natural language question about the data
- `GET /database/info` - Get database schema information
- `POST /database/schema/download` - Download and cache database schema

**Example: Download Database Schema**

```bash
# Download and cache the database schema (requires DB credentials in .env)
curl -X POST http://localhost:3000/database/schema/download \
  -H "Content-Type: application/json"

# Get current schema information
curl http://localhost:3000/database/info

# Ask a natural language question
curl -X POST http://localhost:3000/database/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "Show me the top 10 accounts by balance"}'
```

#### JSON-RPC Endpoints

- `POST /jsonrpc` - Execute JSON-RPC method
- `GET /jsonrpc/chain-id` - Get chain ID
- `GET /jsonrpc/block/:blockNumber?` - Get block by number
- `GET /jsonrpc/transaction/:hash` - Get transaction by hash
- `POST /jsonrpc/eth-call` - Execute eth_call
- `POST /jsonrpc/send-transaction` - Send raw transaction
- `GET /jsonrpc/methods` - List available methods

### MCP Tools

The server provides the following tools:

## GraphQL Tools

#### `execute_graphql_query`

Execute a GraphQL query against the Hgraph API.

**Parameters:**

- `query` (string): GraphQL query string
- `variables` (object, optional): Variables for the GraphQL query

**Example:**

```json
{
  "name": "execute_graphql_query",
  "arguments": {
    "query": "query GetAccount($accountId: String!) { account(id: $accountId) { id balance createdTimestamp } }",
    "variables": { "accountId": "0.0.123456" }
  }
}
```

#### `get_graphql_schema`

Get the GraphQL schema definition and available types.

**Example:**

```json
{
  "name": "get_graphql_schema",
  "arguments": {}
}
```

#### `get_graphql_query_template`

Get a GraphQL query template/example for learning purposes (not for direct execution).

**Parameters:**

- `description` (string): Description of what data you want to query
- `returnFields` (array, optional): Specific fields to return

**Example:**

```json
{
  "name": "get_graphql_query_template",
  "arguments": {
    "description": "Get account balance and transaction history for a specific account"
  }
}
```

## Data Access Tools

### Natural Language Database Queries

#### `ask_question`

Ask questions about the database in natural language and get structured data back.

**Parameters:**

- `question` (string): Natural language question about the data

**Examples:**

```json
{
  "name": "ask_question",
  "arguments": {
    "question": "Show me the top 10 accounts by balance"
  }
}
```

```json
{
  "name": "ask_question",
  "arguments": {
    "question": "What are the most recent transactions for account 0.0.98?"
  }
}
```

```json
{
  "name": "ask_question",
  "arguments": {
    "question": "How many unique accounts have made transactions in the last 24 hours?"
  }
}
```

```json
{
  "name": "ask_question",
  "arguments": {
    "question": "List all token transfers greater than 1000 units today"
  }
}
```

```json
{
  "name": "ask_question",
  "arguments": {
    "question": "Show me accounts created in the last week with their initial balances"
  }
}
```

```json
{
  "name": "ask_question",
  "arguments": {
    "question": "What is the total HBAR supply across all accounts?"
  }
}
```

```json
{
  "name": "ask_question",
  "arguments": {
    "question": "Find all smart contract deployments from yesterday"
  }
}
```

```json
{
  "name": "ask_question",
  "arguments": {
    "question": "Which accounts have the most token associations?"
  }
}
```

**Common Question Patterns:**

- **Account queries**: "Show accounts with...", "List accounts that...", "Find accounts where..."
- **Transaction queries**: "Show transactions...", "List recent transfers...", "Find payments..."
- **Token queries**: "Show token balances...", "List NFT owners...", "Find token transfers..."
- **Statistical queries**: "Count...", "Sum...", "Average...", "Group by..."
- **Time-based queries**: "In the last hour/day/week", "Between dates", "Since yesterday"
- **Comparison queries**: "Greater than", "Less than", "Between X and Y"
- **Sorting queries**: "Top 10", "Bottom 5", "Ordered by", "Latest", "Oldest"

**How it works:**

1. Converts your natural language question to SQL using AI (Anthropic Claude) or pattern matching
2. Validates the SQL query against the database schema
3. Executes the query safely (read-only)
4. Returns formatted results

#### `get_database_info`

Get information about available tables and their structure.

**Example:**

```json
{
  "name": "get_database_info",
  "arguments": {}
}
```

#### `download_database_schema`

Download and cache the current database schema for validation.

**Example:**

```json
{
  "name": "download_database_schema",
  "arguments": {}
}
```

**Note:** Following MCP best practices, this server validates all queries and only allows SELECT statements. No direct SQL execution is exposed.

## JSON-RPC Tools

#### `execute_json_rpc`

Execute a JSON-RPC method against the Hgraph JSON-RPC API.

**Parameters:**

- `method` (string): JSON-RPC method name (e.g., eth_chainId, eth_getBlockByNumber)
- `params` (array, optional): Method parameters

**Example:**

```json
{
  "name": "execute_json_rpc",
  "arguments": {
    "method": "eth_getBlockByNumber",
    "params": ["latest", false]
  }
}
```

#### `get_chain_id`

Get the chain ID of the current Hedera network.

**Example:**

```json
{
  "name": "get_chain_id",
  "arguments": {}
}
```

#### `get_block_by_number`

Get block information by block number.

**Parameters:**

- `blockNumber` (string, optional): Block number (hex), or "latest", "earliest", "pending" (default: "latest")
- `fullTransactions` (boolean, optional): Return full transaction objects instead of just hashes (default: false)

**Example:**

```json
{
  "name": "get_block_by_number",
  "arguments": {
    "blockNumber": "0x1234",
    "fullTransactions": true
  }
}
```

#### `get_transaction_by_hash`

Get transaction details by transaction hash.

**Parameters:**

- `transactionHash` (string): Transaction hash (with or without 0x prefix)

**Example:**

```json
{
  "name": "get_transaction_by_hash",
  "arguments": {
    "transactionHash": "0x1234567890abcdef..."
  }
}
```

#### `eth_call`

Execute a smart contract call without creating a transaction.

**Parameters:**

- `to` (string): Contract address to call
- `data` (string): Encoded function call data
- `blockNumber` (string, optional): Block number for the call context (default: "latest")

**Example:**

```json
{
  "name": "eth_call",
  "arguments": {
    "to": "0x0000000000000000000000000000000000000167",
    "data": "0x06fdde03",
    "blockNumber": "latest"
  }
}
```

#### `send_raw_transaction`

Send a signed transaction to the network.

**Parameters:**

- `signedTransaction` (string): Signed transaction data (hex encoded)

**Example:**

```json
{
  "name": "send_raw_transaction",
  "arguments": {
    "signedTransaction": "0xf86c808504a817c800..."
  }
}
```

#### `list_json_rpc_methods`

List all supported JSON-RPC methods and their parameters.

**Example:**

```json
{
  "name": "list_json_rpc_methods",
  "arguments": {}
}
```

## REST API Tools

#### `get_account_info`

Get detailed information about a Hedera account.

**Parameters:**

- `accountId` (string): Hedera account ID (e.g., "0.0.123456")

**Example:**

```json
{
  "name": "get_account_info",
  "arguments": {
    "accountId": "0.0.123456"
  }
}
```

#### `get_transaction_history`

Retrieve transaction history for an account.

**Parameters:**

- `accountId` (string): Hedera account ID
- `limit` (number, optional): Maximum number of transactions (default: 10, max: 100)
- `order` (string, optional): Sort order "asc" or "desc" (default: "desc")

**Example:**

```json
{
  "name": "get_transaction_history",
  "arguments": {
    "accountId": "0.0.123456",
    "limit": 25,
    "order": "desc"
  }
}
```

#### `get_token_balances`

Get token balances for an account.

**Parameters:**

- `accountId` (string): Hedera account ID
- `tokenId` (string, optional): Specific token ID to query

**Example:**

```json
{
  "name": "get_token_balances",
  "arguments": {
    "accountId": "0.0.123456"
  }
}
```

#### `get_network_stats`

Get Hedera network statistics.

**Parameters:**

- `metric` (string, optional): Specific metric to retrieve ("all", "tps", "nodes", "supply", default: "all")

**Example:**

```json
{
  "name": "get_network_stats",
  "arguments": {
    "metric": "nodes"
  }
}
```

## Development

### Project Structure

```
src/
├── index.ts          # Main MCP server entry point
└── tools/
    ├── graphql.ts     # GraphQL query execution and schema introspection
    ├── sql.ts         # PostgreSQL query execution and database access
    ├── account.ts     # Account information queries (Hgraph REST API)
    ├── transactions.ts # Transaction history queries (Hgraph REST API)
    ├── tokens.ts      # Token balance queries (Hgraph REST API)
    └── network.ts     # Network statistics queries (Hgraph REST API)
```

### Scripts

- `npm run build`: Compile TypeScript to JavaScript
- `npm run dev`: Run in development mode with auto-reload
- `npm run lint`: Run ESLint on the source code
- `npm test`: Run the test suite

### API Endpoints

The server supports multiple data access methods:

**Primary Interfaces:**

- **GraphQL API**: `https://mainnet.api.hgraph.io/v1/graphql` (requires API key)
- **Direct Database**: PostgreSQL connections to Hgraph mirror node database

**REST API:**

- **Mainnet**: `https://mainnet.api.hgraph.io/v1/api/v1`
- **Testnet**: `https://testnet.api.hgraph.io/v1/api/v1`

For production use with advanced features, sign up for Hgraph at docs.hgraph.com.

## Error Handling

The server includes comprehensive error handling for:

**GraphQL Errors:**

- Query syntax validation
- Schema validation
- Authentication failures
- Rate limiting

**PostgreSQL Errors:**

- Connection failures
- Query syntax validation
- Permission errors
- Data type mismatches

**General Errors:**

- Network timeouts
- Missing or malformed data
- Configuration errors

All errors are returned as MCP-compatible error responses with descriptive messages and context.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:

- GitHub Issues: [Create an issue](https://github.com/your-org/hgraph-mcp-server/issues)
- Hgraph Documentation: [docs.hgraph.com](https://docs.hgraph.com)
- Hedera Documentation: [docs.hedera.com](https://docs.hedera.com)
