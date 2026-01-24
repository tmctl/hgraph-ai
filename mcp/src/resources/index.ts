/**
 * Resource Management for MCP Server
 *
 * Provides access to contextual data sources
 */

import { Resource, ResourceTemplate } from '@modelcontextprotocol/sdk/types.js';

// Resource types
export const RESOURCE_TYPES = {
  SCHEMA: 'schema',
  DOCUMENTATION: 'documentation',
  CONFIGURATION: 'configuration',
  DATA: 'data',
} as const;

// Available resources
const resources: Resource[] = [
  {
    uri: 'hgraph://schema/database',
    name: 'Database Schema',
    description: 'PostgreSQL database schema and relationships',
    mimeType: 'application/json',
  },
];

// Resource templates for dynamic resources
const resourceTemplates: ResourceTemplate[] = [];

/**
 * List all available resources
 */
export async function listResources(): Promise<Resource[]> {
  return resources;
}

/**
 * List all resource templates
 */
export async function listResourceTemplates(): Promise<ResourceTemplate[]> {
  return resourceTemplates;
}

/**
 * Read a resource by URI
 */
export async function readResource(uri: string): Promise<{ content: any; mimeType: string }> {
  // Parse URI - handle hgraph://schema/database format
  if (uri === 'hgraph://schema/database') {
    return readSchemaResource('database');
  }

  // Parse URI for more complex paths
  const url = new URL(uri);
  const pathParts = url.pathname.split('/').filter((part) => part !== '');

  if (pathParts.length === 0) {
    throw new Error(`Invalid resource URI: ${uri}`);
  }

  const [type, ...restParts] = pathParts;

  switch (type) {
    case 'schema':
      return readSchemaResource(restParts.join('/') || 'database');

    default:
      throw new Error(`Unknown resource type: ${type}`);
  }
}

/**
 * Read schema resources
 */
async function readSchemaResource(path: string): Promise<{ content: any; mimeType: string }> {
  switch (path) {
    case 'database':
      // Import database schema
      const { getDatabaseInfo } = await import('../tools/database.js');
      const dbInfo = await getDatabaseInfo();
      return {
        content: dbInfo.content[0].text,
        mimeType: 'application/json',
      };

    default:
      throw new Error(`Unknown schema resource: ${path}`);
  }
}
