#!/usr/bin/env node

/**
 * Script to download and update the database schema with enum types
 */

import 'dotenv/config';
import { downloadDatabaseSchema } from '../tools/database.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

async function updateSchema() {
  console.log('📥 Downloading database schema with types...\n');

  try {
    // Download the schema with all enhancements
    const schema = await downloadDatabaseSchema();

    console.log('\n📊 Schema Statistics:');
    console.log(`   Tables: ${Object.keys(schema.tables).length}`);
    console.log(`   Types: ${Object.keys(schema.types || {}).length}`);
    console.log(`   Relationships: ${schema.relationships.length}`);

    // Count columns with enum types
    let enumColumns = 0;
    for (const table of Object.values(schema.tables)) {
      for (const column of Object.values(table.columns)) {
        if (column.enum_values && column.enum_values.length > 0) {
          enumColumns++;
        }
      }
    }
    console.log(`   Columns with enums: ${enumColumns}`);

    // Save the schema
    const schemaPath = join(process.cwd(), 'src/schema/database-schema.json');
    writeFileSync(schemaPath, JSON.stringify(schema, null, 2));

    console.log(`\n✅ Schema saved to: ${schemaPath}`);

    // Show some example enum types
    if (schema.types && Object.keys(schema.types).length > 0) {
      console.log('\n📝 Sample Enum Types:');
      const sampleTypes = Object.entries(schema.types).slice(0, 5);
      for (const [name, type] of sampleTypes) {
        if (type.values && Array.isArray(type.values)) {
          console.log(
            `   ${name}: ${type.values.slice(0, 3).join(', ')}${type.values.length > 3 ? '...' : ''}`,
          );
        } else if (type.type) {
          console.log(`   ${name}: ${type.type} type`);
        }
      }
    }

    console.log('\n✨ Schema update completed successfully!');
  } catch (error) {
    console.error('❌ Failed to update schema:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  updateSchema().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
}
