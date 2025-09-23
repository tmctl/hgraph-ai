# Hgraph MCP Full Stack Application

This repository now contains a complete full-stack application with:
- **Backend**: MCP Server with OAuth 2.1 authentication
- **Frontend**: React + Vite application
- **Auth**: Keycloak for OAuth/OIDC
- **Database**: PostgreSQL for Keycloak

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Docker and Docker Compose
- npm or yarn

### Development Setup

1. **Install dependencies**:
```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..
```

2. **Start all services**:
```bash
# Start everything (Keycloak, PostgreSQL, MCP Server, Frontend)
npm run dev:all
```

This will:
- Start Keycloak at http://localhost:8080
- Start MCP Server at http://localhost:3001
- Start Frontend at http://localhost:5173

### Docker Deployment

```bash
# Build and start all services in Docker
docker-compose up --build
```

Services will be available at:
- Frontend: http://localhost:5173
- MCP Server: http://localhost:3001
- Keycloak: http://localhost:8080

## 📁 Project Structure

```
mcp/
├── src/                    # MCP server source code
│   ├── auth/              # OAuth middleware and routes
│   ├── tools/             # MCP tools
│   └── ...
├── frontend/              # React frontend application
│   ├── src/              
│   │   ├── components/   # React components
│   │   ├── pages/        # Page components
│   │   ├── hooks/        # Custom hooks
│   │   └── lib/          # Utilities
│   ├── Dockerfile        # Frontend Docker config
│   └── nginx.conf        # Nginx configuration
├── keycloak/              # Keycloak configuration
│   └── realms/           # Realm configurations
├── docker-compose.yml     # Docker orchestration
├── Dockerfile            # MCP server Docker config
└── package.json          # Backend dependencies
```

## 🔐 Authentication

The application uses OAuth 2.1 with Keycloak:

### Default Users
- **Admin**: admin/admin (Keycloak console)
- **Test User**: test-user/test123
- **Admin User**: admin-user/admin123

### OAuth Clients
- **mcp-api**: Server-side client (mcp-api-secret)
- **mcp-public-client**: Browser-based client (public)
- **mcp-service-client**: Service account (mcp-service-secret)

### Getting Access Tokens

```bash
# Client credentials flow
curl -X POST http://localhost:8080/realms/mcp/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=mcp-api" \
  -d "client_secret=mcp-api-secret" \
  -d "scope=mcp.read mcp.write"

# Password flow (for testing)
curl -X POST http://localhost:8080/realms/mcp/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=mcp-public-client" \
  -d "username=test-user" \
  -d "password=test123" \
  -d "scope=openid mcp.read mcp.write"
```

## 🛠️ Available Scripts

### Root Package
- `npm run dev:all` - Start all services in development mode
- `npm run dev:oauth` - Start OAuth-enabled MCP server
- `npm run dev:frontend` - Start frontend development server
- `npm run build:all` - Build both backend and frontend
- `npm run docker:up` - Start Docker services
- `npm run docker:down` - Stop Docker services
- `npm run docker:logs` - View Docker logs

### Frontend Package
- `npm run dev` - Start Vite dev server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Lint the code

## 🔧 Configuration

### Backend Environment Variables
Create `.env` file in root:
```env
MCP_PORT=3001
MCP_AUTH_ENABLED=true
MCP_AUTH_MODE=oauth2
MCP_AUTH_ISSUER=http://localhost:8080/realms/mcp
MCP_AUTH_AUDIENCE=mcp-api
MCP_AUTH_JWKS_URI=http://localhost:8080/realms/mcp/protocol/openid-connect/certs
# Add other configuration as needed
```

### Frontend Environment Variables
Create `.env` file in frontend/:
```env
VITE_API_BASE_URL=http://localhost:3001
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=mcp
VITE_KEYCLOAK_CLIENT_ID=mcp-public-client
```

## 📚 API Documentation

### MCP Endpoints
- `GET /.well-known/oauth-authorization-server` - OAuth discovery
- `GET /mcp/health` - Health check
- `POST /mcp/message` - Send MCP message
- `GET /mcp/sse` - SSE stream for real-time updates
- `POST /mcp/batch` - Batch operations

### Authentication Flow
1. Frontend redirects to Keycloak login
2. User authenticates with Keycloak
3. Keycloak redirects back with authorization code
4. Frontend exchanges code for access token
5. Frontend includes Bearer token in API requests
6. MCP server validates token with JWKS

## 🐳 Docker Architecture

The application uses a multi-container setup:
1. **PostgreSQL**: Database for Keycloak
2. **Keycloak**: Identity and access management
3. **MCP Server**: Backend API with OAuth protection
4. **Frontend**: Nginx serving React application

All containers are connected via the `mcp-network` Docker network.

## 🧪 Testing

```bash
# Run backend tests
npm test

# Run frontend tests
cd frontend && npm test

# Test OAuth flow
npm run test:oauth

# Test with Docker
docker-compose up -d
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/mcp/health
```

## 📝 License

MIT