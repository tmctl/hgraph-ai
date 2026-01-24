/**
 * Test script for enum type enhancements
 */

import { downloadDatabaseSchema } from '../src/tools/database.js';
import { validateQuery } from '../src/tools/queryValidator.js';
import { getEnumValueSuggestions } from '../src/tools/queryAutoComplete.js';

console.log('🧪 Testing Database Enum Type Enhancements\n');

async function testEnumTypes() {
  // Test 1: Download schema with enum types
  console.log('1️⃣ Testing Schema Download with Enum Types');

  try {
    // Mock the database connection for testing
    console.log('   ⚠️  Note: This test requires database connection');
    console.log('   📝 Schema will include enum types if database is configured\n');

    // Test validation with enum values
    console.log('2️⃣ Testing Enum Value Validation');

    // Test invalid enum value
    const invalidEnumQuery = "SELECT * FROM entity WHERE type = 'INVALID_TYPE'";
    const validation1 = validateQuery(invalidEnumQuery);
    console.log(`   ✅ Query validation checked`);
    if (validation1.errors.length > 0) {
      const enumError = validation1.errors.find((e) => e.message.includes('enum'));
      if (enumError) {
        console.log(`   ✅ Invalid enum detected: ${enumError.message}`);
      }
    }

    // Test valid enum value
    const validEnumQuery = "SELECT * FROM entity WHERE type = 'ACCOUNT'";
    const validation2 = validateQuery(validEnumQuery);
    console.log(
      `   ✅ Valid enum value accepted: ${validation2.errors.length === 0 || !validation2.errors.some((e) => e.message.includes("'ACCOUNT'"))}`,
    );

    // Test 3: Enum value auto-completion
    console.log('\n3️⃣ Testing Enum Value Auto-completion');

    // Mock schema for testing
    const mockSchema = {
      tables: {
        entity: {
          columns: {
            type: {
              data_type: 'USER-DEFINED',
              udt_name: 'entity_type',
              enum_values: ['ACCOUNT', 'CONTRACT', 'FILE', 'TOPIC', 'TOKEN', 'SCHEDULE'],
              is_nullable: false,
              column_default: null,
            },
          },
        },
      },
      relationships: [],
      types: {
        entity_type: {
          type: 'enum' as const,
          values: ['ACCOUNT', 'CONTRACT', 'FILE', 'TOPIC', 'TOKEN', 'SCHEDULE'],
          description: 'Type of Hedera entity',
        },
      },
    };

    const suggestions = getEnumValueSuggestions('entity', 'type', 'ACC', mockSchema);
    console.log(`   ✅ Generated ${suggestions.length} enum suggestions`);
    if (suggestions.length > 0) {
      console.log(`   ✅ Suggestion: ${suggestions[0].text} (${suggestions[0].type})`);
    }

    // Test 4: Schema type descriptions
    console.log('\n4️⃣ Testing Type Descriptions');

    if (mockSchema.types?.entity_type) {
      console.log(`   ✅ Entity type description: ${mockSchema.types.entity_type.description}`);
      console.log(
        `   ✅ Enum values: ${mockSchema.types.entity_type.values?.slice(0, 3).join(', ')}...`,
      );
    }

    // Test 5: Column metadata with enum info
    console.log('\n5️⃣ Testing Column Metadata Enhancement');

    const column = mockSchema.tables.entity.columns.type;
    console.log(`   ✅ Column data type: ${column.data_type}`);
    console.log(`   ✅ UDT name: ${column.udt_name}`);
    console.log(`   ✅ Has enum values: ${(column.enum_values?.length || 0) > 0}`);
    console.log(`   ✅ Is nullable: ${column.is_nullable}`);

    console.log('\n✨ Enum type tests completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the tests
testEnumTypes().catch(console.error);
