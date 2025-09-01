# hgraph.ai - Blockchain Powered AI

## Overview

hgraph.ai is a cutting-edge artificial intelligence platform that leverages blockchain technology to deliver secure, transparent, and decentralized AI services. By combining the power of advanced language models with the immutability and security of blockchain, hgraph.ai provides a revolutionary approach to AI interactions.

## Key Features

### 🔗 Blockchain Integration

- **Decentralized AI Processing**: Distributed computing power across the blockchain network
- **Immutable Conversation History**: All interactions are securely recorded on-chain
- **Smart Contract Integration**: Automated AI workflows through blockchain smart contracts
- **Token-Based Access**: Transparent usage and billing through blockchain tokens

### 🤖 AI Capabilities

- **Advanced Language Models**: State-of-the-art natural language processing
- **Multi-Modal Support**: Text, code, and data analysis capabilities
- **Contextual Understanding**: Intelligent conversation flow with memory persistence
- **Custom Model Training**: Fine-tune models for specific use cases

### 🔒 Security & Privacy

- **End-to-End Encryption**: All communications are encrypted using blockchain cryptography
- **Data Sovereignty**: Users maintain complete control over their data
- **Verifiable AI Outputs**: Blockchain verification of AI responses
- **Anonymous Usage Options**: Privacy-preserving interactions through blockchain wallets

## Architecture

```
┌─────────────────────────────────────────┐
│           Frontend (React/Next.js)       │
│         Chat Interface & Dashboard       │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│          MCP Server (Port 3000)          │
│   HTTP REST API / MCP Protocol Server    │
└─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌──────────────┐        ┌──────────────────┐
│  Hgraph APIs │        │  Hedera Network  │
│   GraphQL    │◄───────┤   Blockchain     │
│   REST/RPC   │        │    Mirror Node   │
└──────────────┘        └──────────────────┘
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn
- Web3 wallet (MetaMask, WalletConnect, etc.)
- hgraph tokens for platform access

### Installation

```bash
# Clone the repository
git clone https://github.com/hgraph/hgraph-ai.git
cd hgraph-ai

# Install dependencies
npm install

# Set up environment variables
cp mcp/.env.example mcp/.env
# Edit .env with your configuration

# Start development server (multiple options)
npm run dev              # Start all services
npm run dev:mcp-server   # Start MCP HTTP server only
npm run dev:frontend     # Start frontend only
```

### Configuration

Create a `.env` file in the `mcp` directory with the following variables:

```env
# Server Configuration
MCP_PORT=3000  # Port for HTTP server mode

# Hgraph API Configuration
HGRAPH_GRAPHQL_URL=https://mainnet.hedera.api.hgraph.io/v1/graphql
HGRAPH_REST_URL=https://mainnet.hedera.api.hgraph.io/v1/pk_prod_ab2c41b848c0b568e96a31ef0ca2f2fbaa549470/api/v1
HGRAPH_API_KEY=your-hgraph-api-key-here

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000
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
npm run dev:mcp-http     # Development (default port 3001)
MCP_PORT=8080 npm run dev:mcp-http  # Custom port
```

### HTTP/SSE API

The HTTP server uses Server-Sent Events for real-time streaming:

- `GET /` - Server information
- `GET /health` - Health check
- `GET /sse` - SSE connection endpoint
- `POST /rpc` - JSON-RPC endpoint

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

#### JSON-RPC Methods

- `POST /jsonrpc` - Execute any JSON-RPC method
- `GET /jsonrpc/chain-id` - Get chain ID
- `GET /jsonrpc/block/:blockNumber` - Get block data
- `GET /jsonrpc/transaction/:hash` - Get transaction

### API Example

```bash
# Check server health
curl http://localhost:3000/health

# Get network statistics
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{"tool": "get_network_stats", "arguments": {"metric": "all"}}'

# Execute GraphQL query
curl -X POST http://localhost:3000/graphql/execute \
  -H "Content-Type: application/json" \
  -d '{"query": "{ accounts(limit: 5) { id balance } }"}'
```

## Development

### Tech Stack

- **Frontend**: React, Next.js, TypeScript
- **Styling**: Tailwind CSS
- **Blockchain**: Hedera Hashgraph
- **APIs**: Hgraph GraphQL, REST, JSON-RPC
- **Backend**: Node.js, Express (HTTP mode)
- **Protocol**: Model Context Protocol (MCP)
- **Data Access**: GraphQL with full introspection

### Project Structure

```
hgraph-ai/
├── frontend/          # Next.js web interface
├── mcp/              # MCP server (stdio & HTTP modes)
│   ├── src/
│   │   ├── index.ts      # Stdio MCP server
│   │   ├── server-http.ts # HTTP/SSE MCP server
│   │   ├── tools/        # Hgraph API integrations
│   │   ├── resources/    # MCP resources
│   │   ├── prompts/      # MCP prompt templates
│   │   ├── transport/    # Transport implementations
│   │   └── middleware/   # Auth & security
│   └── tests/        # Test suites
├── agent/            # Python AI agent
└── package.json      # Monorepo configuration
```

## Roadmap

- [x] Basic chat interface
- [x] Blockchain integration
- [ ] Multi-model support
- [ ] Decentralized model hosting
- [ ] DAO governance
- [ ] Cross-chain compatibility
- [ ] Mobile applications
- [ ] Developer SDK

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) for details.

## Support

- Documentation: [docs.hgraph.ai](https://docs.hgraph.ai)
- Discord: [discord.gg/hgraph](https://discord.gg/hgraph)
- Twitter: [@hgraph_ai](https://twitter.com/hgraph_ai)

## Disclaimer

hgraph.ai is an experimental platform combining blockchain and AI technologies. Users should understand the risks associated with both blockchain transactions and AI-generated content.

---

**Built with ❤️ by the hgraph team**
