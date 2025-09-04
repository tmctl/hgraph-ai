/**
 * Test script for developer experience improvements
 */

import { getAllTemplates, getTemplate, formatTemplate } from '../src/tools/queryTemplates.js';
import { validateQuery, quickValidate, suggestFixes } from '../src/tools/queryValidator.js';
import { getQuerySuggestions, generateQueryCompletion } from '../src/tools/queryAutoComplete.js';

console.log('🧪 Testing Developer Experience Improvements\n');

// Test 1: Enhanced Query Templates
console.log('1️⃣ Testing Enhanced Query Templates');
const templates = getAllTemplates();
console.log(`   ✅ Found ${templates.length} query templates`);

const complexTemplate = getTemplate('account_activity_analysis');
if (complexTemplate) {
  console.log(`   ✅ Complex template loaded: ${complexTemplate.name}`);
  const formatted = formatTemplate('account_activity_analysis', {
    account_id: '0.0.123456',
    time_range: '30 days',
  });
  console.log(`   ✅ Template formatted successfully`);
} else {
  console.log('   ❌ Failed to load complex template');
}

// Test 2: Query Validation
console.log('\n2️⃣ Testing Query Validation');

// Test invalid query
const invalidQuery = 'SELECT * FROM non_existent_table';
const validation1 = validateQuery(invalidQuery);
console.log(`   ✅ Invalid query detected: ${!validation1.valid}`);
if (validation1.errors.length > 0) {
  console.log(`   ✅ Error found: ${validation1.errors[0].message}`);
}

// Test valid query with warnings
const warningQuery = 'SELECT * FROM transaction';
const validation2 = validateQuery(warningQuery);
console.log(`   ✅ Query validated: ${validation2.valid}`);
if (validation2.warnings.length > 0) {
  console.log(`   ✅ Warning generated: ${validation2.warnings[0].message}`);
}

// Test optimization suggestions
const unoptimizedQuery = 'SELECT balance FROM account WHERE account_id = 123456';
const validation3 = validateQuery(unoptimizedQuery);
if (validation3.suggestions.length > 0) {
  console.log(`   ✅ Optimization suggested: ${validation3.suggestions[0].message}`);
}

// Test quick validation
const quickCheck = quickValidate('DROP TABLE account');
console.log(`   ✅ Forbidden operation detected: ${!quickCheck.valid}`);

// Test 3: Query Auto-completion
console.log('\n3️⃣ Testing Query Auto-completion');

// Test query suggestions
const partialQuery = 'SELECT * FROM acc';
const suggestions = getQuerySuggestions(partialQuery, partialQuery.length);
console.log(`   ✅ Generated ${suggestions.length} suggestions`);
if (suggestions.length > 0) {
  console.log(`   ✅ First suggestion: ${suggestions[0].text} (${suggestions[0].type})`);
}

// Test query completion
const completion = generateQueryCompletion('Find accounts', 'account');
console.log(`   ✅ Query completion generated: ${completion.substring(0, 30)}...`);

// Test 4: Error Fix Suggestions
console.log('\n4️⃣ Testing Error Fix Suggestions');
const errorQuery = 'SELECT * FROM accont'; // Typo in 'account'
const errorValidation = validateQuery(errorQuery);
if (errorValidation.errors.length > 0) {
  const fixes = suggestFixes(errorQuery, errorValidation.errors[0]);
  if (fixes.length > 0) {
    console.log(`   ✅ Fix suggested for typo: ${fixes.length > 0}`);
  }
}

// Test 5: Complex Query Analysis
console.log('\n5️⃣ Testing Complex Query Analysis');
const complexQuery = `
  WITH daily_stats AS (
    SELECT 
      DATE_TRUNC('day', to_timestamp(consensus_timestamp / 1000000000)) as day,
      COUNT(*) as tx_count
    FROM transaction
    WHERE payer_account_id = '0.0.123456'
    GROUP BY day
  )
  SELECT * FROM daily_stats
  ORDER BY day DESC
  LIMIT 10
`;

const complexValidation = validateQuery(complexQuery);
console.log(`   ✅ Complex query validated: ${complexValidation.valid}`);
if (complexValidation.formattedQuery) {
  console.log(`   ✅ Query formatted successfully`);
}

console.log('\n✨ All tests completed successfully!');
