import Keycloak from 'keycloak-js';

// Keycloak configuration
const keycloakConfig = {
  url: 'http://localhost:8080',
  realm: 'mcp',
  clientId: 'mcp-public-client',
};

// Create Keycloak instance
const keycloak = new Keycloak(keycloakConfig);

export default keycloak;
