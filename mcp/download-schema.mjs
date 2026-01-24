#!/usr/bin/env node

// Load environment variables
import 'dotenv/config';
import { downloadDatabaseSchema } from './dist/tools/database.js';

// Download and save the schema
async function main() {
  try {
    console.log('Downloading database schema...');
    console.log('Including both public and ecosystem schemas...');
    console.log('Filtering out account_balance* and token_balance* tables...');
    
    const schema = await downloadDatabaseSchema();
    
    const tableCount = Object.keys(schema.tables).length;
    const relationshipCount = schema.relationships.length;
    
    // Count tables by schema
    const publicTables = Object.keys(schema.tables).filter(t => !t.startsWith('ecosystem.')).length;
    const ecosystemTables = Object.keys(schema.tables).filter(t => t.startsWith('ecosystem.')).length;
    
    console.log(`✅ Schema downloaded successfully!`);
    console.log(`   - Total tables: ${tableCount}`);
    console.log(`   - Public schema: ${publicTables} tables`);
    console.log(`   - Ecosystem schema: ${ecosystemTables} tables`);
    console.log(`   - Relationships: ${relationshipCount}`);
    console.log(`   - Saved to: mcp/src/schema/database-schema.json`);
    
    // Show sample tables from each schema
    const publicSample = Object.keys(schema.tables).filter(t => !t.startsWith('ecosystem.')).slice(0, 5);
    const ecosystemSample = Object.keys(schema.tables).filter(t => t.startsWith('ecosystem.')).slice(0, 5);
    
    if (publicSample.length > 0) {
      console.log(`   - Sample public tables: ${publicSample.join(', ')}...`);
    }
    if (ecosystemSample.length > 0) {
      console.log(`   - Sample ecosystem tables: ${ecosystemSample.join(', ')}...`);
    }
    
    // Verify balance tables are excluded
    const hasBalanceTables = Object.keys(schema.tables).some(t => 
      t.includes('account_balance') || t.includes('token_balance')
    );
    if (hasBalanceTables) {
      console.warn('⚠️  Warning: balance tables were not properly filtered');
    } else {
      console.log('✅ account_balance* and token_balance* tables successfully excluded');
    }
    
  } catch (error) {
    console.error('❌ Error downloading schema:', error.message);
    console.error('Make sure your database credentials are configured in .env file');
    process.exit(1);
  }
}

main();