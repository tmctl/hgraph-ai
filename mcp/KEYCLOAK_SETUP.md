# Keycloak Client Configuration for Frontend

## Access Keycloak Admin Console

1. Open browser and go to: http://localhost:8080
2. Click "Administration Console"
3. Login with:
   - Username: `admin`
   - Password: `admin`

## Configure mcp-public-client

1. Select the `mcp` realm from the dropdown (top-left)
2. Navigate to: Clients → mcp-public-client
3. Update the following settings:

### Settings Tab:

- **Valid Redirect URIs**: Add these (one per line):

  ```
  http://localhost:5173/*
  http://localhost:3000/*
  http://localhost:3001/auth/callback
  http://localhost:8080/*
  ```

- **Valid Post Logout Redirect URIs**: Add:

  ```
  http://localhost:5173/*
  ```

- **Web Origins**: Add these (one per line):
  ```
  http://localhost:5173
  http://localhost:3000
  http://localhost:3001
  http://localhost:8080
  +
  ```

4. Click "Save" at the bottom of the page

## Test Authentication

After saving the configuration:

1. Open http://localhost:5173 in your browser
2. You should be redirected to the login page
3. Click "Sign in with Keycloak"
4. Login with test credentials:
   - Username: `test-user`
   - Password: `test123`
5. You should be redirected back to the application with your user profile visible

## Alternative: Use Docker Exec

If you prefer command line, you can also update the client using Docker exec:

```bash
# Access Keycloak container
docker exec -it mcp-keycloak bash

# Inside container, use kcadm.sh to update client
cd /opt/keycloak/bin
./kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password admin
./kcadm.sh update clients/$(./kcadm.sh get clients -r mcp --fields id,clientId | jq -r '.[] | select(.clientId=="mcp-public-client") | .id') -r mcp -s 'redirectUris=["http://localhost:5173/*","http://localhost:3000/*","http://localhost:3001/auth/callback","http://localhost:8080/*"]' -s 'webOrigins=["http://localhost:5173","http://localhost:3000","http://localhost:3001","http://localhost:8080","+"]'
```
