# Hgraph AI - MCP Server for Hedera Blockchain

## Overview

Hgraph AI is a Model Context Protocol (MCP) server that provides AI assistants with comprehensive access to Hedera blockchain data. It integrates with hgraph's GraphQL, REST, and JSON-RPC APIs to enable natural language queries, data analysis, and blockchain exploration through AI interfaces like Claude.

## Key Features

### 🔗 Hedera Blockchain Integration

- **Complete Data Access**: Query accounts, tokens, transactions, and smart contracts
- **Multiple API Endpoints**: GraphQL, REST, and JSON-RPC support
- **Real-time Data**: Access to live Hedera network information
- **Natural Language Queries**: AI-powered database queries in plain English

### 🤖 MCP Protocol Support

- **Tools**: 17+ blockchain analysis and query tools
- **Resources**: Dynamic access to schemas, documentation, and data
- **Prompts**: 8 pre-built templates for common blockchain analysis tasks
- **Dual Transport**: Both stdio (Claude Desktop) and HTTP/SSE (web apps) modes

### 📊 Advanced Capabilities

- **D3.js Visualizations**: Generate interactive blockchain data visualizations
- **SQL Query Generation**: Natural language to SQL for complex database queries
- **Schema Introspection**: Full GraphQL schema exploration and documentation
- **Transaction Analysis**: Deep dive into Hedera transaction histories and patterns

## Architecture

```
┌─────────────────────────────────────────┐
│        AI Assistant (Claude/etc)        │
│         MCP Client Interface            │
└─────────────────────────────────────────┘
                    │
            MCP Protocol (stdio/HTTP)
                    ▼
┌─────────────────────────────────────────┐
│          Hgraph MCP Server              │
│    Tools | Resources | Prompts          │
└─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌──────────────┐        ┌──────────────────┐
│  Hgraph APIs │        │  Hedera Network  │
│   GraphQL    │◄───────┤   Blockchain     │
│   REST/RPC   │        │    Mirror Node   │
│   Database   │        │    PostgreSQL    │
└──────────────┘        └──────────────────┘
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Hgraph API key (get from hgraph.io)
- Optional: PostgreSQL database for natural language queries
- Optional: Anthropic API key for enhanced SQL generation

### Installation

```bash
# Clone the repository
git clone https://github.com/hgraph/hgraph-ai.git
cd hgraph-ai

# Install dependencies
npm install

# Set up environment variables
cp mcp/.env.example mcp/.env
# Edit .env with your hgraph API key and database config

# Start MCP server (choose mode)
npm run dev:mcp          # Stdio mode (for Claude Desktop)
npm run dev:mcp-http     # HTTP mode (for web applications)
```

### Configuration

Create a `.env` file in the `mcp` directory with the following variables:

```env
# Server Configuration
MCP_PORT=3000

# Hgraph API Configuration
HGRAPH_GRAPHQL_URL=https://mainnet.hedera.api.hgraph.io/v1/graphql
HGRAPH_REST_URL=https://mainnet.hedera.api.hgraph.io/v1/pk_prod_ab2c41b848c0b568e96a31ef0ca2f2fbaa549470/api/v1
HGRAPH_API_KEY=your-hgraph-api-key-here

# Database Configuration (for natural language queries)
DB_HOST=your-hgraph-database-host
DB_PORT=5432
DB_DATABASE=hgraph
DB_USERNAME=your-username
DB_PASSWORD=your-password
DB_SSL=true

# Optional: Anthropic API for enhanced SQL generation
ANTHROPIC_API_KEY=your-anthropic-api-key-here
```

## Usage

### MCP Server Modes

The MCP server can run in two modes:

#### 1. Stdio Mode (for Claude Desktop)

```bash
npm run dev:mcp          # Development
npm run start:mcp        # Production
```

Configure in Claude Desktop's settings to connect to the MCP server.

#### 2. HTTP/SSE Mode (for Web Applications)

```bash
npm run dev:mcp-http     # Development (default port 3000)
MCP_PORT=8080 npm run dev:mcp-http  # Custom port
```

### MCP HTTP Server API

The HTTP server provides MCP protocol over HTTP with Server-Sent Events:

- `GET /` - Server information and capabilities
- `GET /health` - Health check endpoint
- `GET /sse` - SSE connection for MCP protocol
- `POST /message` - MCP JSON-RPC message endpoint
- OAuth 2.0 authentication endpoints (`/oauth/*`)

### MCP Capabilities

#### Tools (17 available)

- GraphQL query execution
- Natural language database queries
- Transaction history and token balances
- JSON-RPC methods (read-only)
- D3.js visualization generation

#### Resources

- GraphQL and database schemas
- API documentation
- Dynamic data access (accounts, tokens, contracts)

#### Prompts (8 templates)

- Account analysis
- Token portfolio
- Transaction investigation
- Smart contract auditing
- Network statistics

#### Available MCP Tools

**Account & Network Tools:**

- `get_account_balance` - Check HBAR and token balances
- `get_account_info` - Account details and metadata
- `get_network_stats` - Network performance and statistics
- `search_accounts` - Find accounts by criteria

**Transaction & Token Tools:**

- `get_account_transactions` - Transaction history
- `get_transaction_details` - Detailed transaction info
- `get_token_info` - Token metadata and supply
- `get_token_balances` - Token holdings across accounts

**Smart Contract & Query Tools:**

- `execute_graphql_query` - Direct GraphQL queries
- `execute_jsonrpc_call` - JSON-RPC method execution
- `ask_question` - Natural language database queries
- `generate_d3_visualization` - Create data visualizations

**Utility Tools:**

- `get_graphql_schema` - Schema introspection
- `format_sql_query` - SQL formatting and validation
- `get_database_schema` - Database structure info

### Usage Examples

#### With Claude Desktop (Stdio Mode)

1. Start the MCP server:

```bash
npm run dev:mcp
```

2. Add to Claude Desktop configuration:

```json
{
  "mcpServers": {
    "hgraph-ai": {
      "command": "node",
      "args": ["/path/to/hgraph-ai/mcp/dist/index.js"]
    }
  }
}
```

#### With HTTP/SSE Mode

```bash
# Check server health
curl http://localhost:3000/health

# MCP protocol over HTTP
curl -X POST http://localhost:3000/message \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "get_network_stats", "arguments": {}}}'
```

## Development

### Tech Stack

- **Runtime**: Node.js 18+ with TypeScript
- **Protocol**: Model Context Protocol (MCP) 1.0
- **Transport**: Stdio and HTTP/SSE
- **Blockchain**: Hedera Hashgraph network
- **APIs**: Hgraph GraphQL, REST, JSON-RPC
- **Database**: PostgreSQL (optional, for natural language queries)
- **AI Integration**: Anthropic SDK (optional, for enhanced SQL generation)
- **HTTP Server**: Express.js with OAuth 2.0 authentication
- **Testing**: Jest with comprehensive test suites

### Project Structure

```
hgraph-ai/
├── mcp/                   # MCP server implementation
│   ├── src/
│   │   ├── index.ts       # Stdio MCP server entry point
│   │   ├── server-http.ts # HTTP/SSE MCP server
│   │   ├── tools/         # 17+ blockchain analysis tools
│   │   │   ├── account.ts    # Account queries and balances
│   │   │   ├── transactions.ts # Transaction history
│   │   │   ├── tokens.ts     # Token information
│   │   │   ├── graphql.ts    # GraphQL query execution
│   │   │   ├── database.ts   # Natural language SQL queries
│   │   │   └── *.ts         # Other specialized tools
│   │   ├── resources/     # MCP resources (schemas, docs)
│   │   ├── prompts/       # 8 pre-built analysis templates
│   │   ├── routes/        # OAuth and authentication routes
│   │   ├── middleware/    # Authentication and security
│   │   ├── transport/     # SSE transport implementation
│   │   ├── models/        # Data models and types
│   │   └── utils/         # Utility functions
│   ├── tests/            # Comprehensive test suites
│   │   ├── unit/         # Unit tests for tools
│   │   └── integration/  # Integration tests
│   ├── dist/             # Compiled JavaScript output
│   └── *.config.*        # Configuration files
└── package.json          # Project configuration
```

## Available Scripts

```bash
# Development
npm run dev:mcp          # Start stdio MCP server
npm run dev:mcp-http     # Start HTTP MCP server

# Production
npm run build:mcp        # Compile TypeScript to JavaScript
npm run start:mcp        # Run compiled stdio server
npm run start:mcp-http   # Run compiled HTTP server

# Testing
npm test                 # Run all tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Generate coverage report
npm run test:unit        # Run unit tests only
npm run test:integration # Run integration tests only

# Code Quality
npm run lint:mcp         # Lint TypeScript code
npm run format           # Format code with Prettier
npm run format:check     # Check code formatting
```

## Roadmap

- [x] Core MCP protocol implementation
- [x] Hedera blockchain integration
- [x] Natural language database queries
- [x] OAuth 2.0 authentication
- [x] Comprehensive test coverage
- [ ] Additional blockchain networks
- [ ] Enhanced visualization capabilities
- [ ] Performance optimizations
- [ ] Advanced analytics tools

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) for details.

## Support

- Documentation: [docs.hgraph.com](https://docs.hgraph.com)
- MCP Protocol: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- Hedera Network: [hedera.com](https://hedera.com)
- Issues: [GitHub Issues](https://github.com/hgraph/hgraph-ai/issues)

## Disclaimer

This MCP server provides read-only access to Hedera blockchain data through hgraph's APIs. No transactions are executed or private keys handled. Users should verify critical information independently and understand that AI-generated analysis may contain errors.

---

**Built with ❤️ by the hgraph team**
