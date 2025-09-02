#!/usr/bin/env node

// Load environment variables
import 'dotenv/config';
import { downloadDatabaseSchema } from './dist/tools/database.js';

// Download and save the schema
async function main() {
  try {
    console.log('Downloading database schema...');
    console.log('Filtering out account_balance* tables...');
    
    const schema = await downloadDatabaseSchema();
    
    const tableCount = Object.keys(schema.tables).length;
    const relationshipCount = schema.relationships.length;
    
    console.log(`✅ Schema downloaded successfully!`);
    console.log(`   - Tables: ${tableCount}`);
    console.log(`   - Relationships: ${relationshipCount}`);
    console.log(`   - Saved to: mcp/src/schema/database-schema.json`);
    
    // Show first few tables as confirmation
    const tables = Object.keys(schema.tables).slice(0, 10);
    console.log(`   - Sample tables: ${tables.join(', ')}...`);
    
    // Verify account_balance tables are excluded
    const hasAccountBalance = Object.keys(schema.tables).some(t => t.startsWith('account_balance'));
    if (hasAccountBalance) {
      console.warn('⚠️  Warning: account_balance tables were not properly filtered');
    } else {
      console.log('✅ account_balance* tables successfully excluded');
    }
    
  } catch (error) {
    console.error('❌ Error downloading schema:', error.message);
    console.error('Make sure your database credentials are configured in .env file');
    process.exit(1);
  }
}

main();