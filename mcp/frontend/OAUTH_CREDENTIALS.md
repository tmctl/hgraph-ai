# OAuth Credentials for MCP Dashboard

## User Login Credentials
```
Username: test-user
Password: test123
```

## OAuth Client Credentials (for API access)
```
Client ID:     mcp-api
Client Secret: mcp-api-secret
```

## URLs
- Keycloak Admin: http://localhost:8080
- MCP Dashboard: http://localhost:5173/mcp-dashboard
- Token Endpoint: http://localhost:8080/realms/mcp/protocol/openid-connect/token
- MCP API: http://localhost:3001/mcp/message

## Test OAuth Flow
1. Navigate to http://localhost:5173/mcp-dashboard
2. You'll be redirected to Keycloak login
3. Login with `test-user` / `test123`
4. After successful login, you'll be redirected back to the dashboard
5. The dashboard will fetch actual MCP server tools using the OAuth token

## Get OAuth Token via CLI
```bash
TOKEN=$(curl -s -X POST \
  http://localhost:8080/realms/mcp/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=mcp-api&client_secret=mcp-api-secret" \
  | jq -r '.access_token')
```

## Test MCP API with Token
```bash
curl -X POST http://localhost:3001/mcp/message \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```