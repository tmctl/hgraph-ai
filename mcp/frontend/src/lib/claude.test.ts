// Simple test to verify Claude API integration
// This is a basic smoke test - run manually with appropriate API key

import { createClaudeAPI } from './claude';

export const testClaudeIntegration = async () => {
  try {
    console.log('Testing Claude API integration...');
    
    // This will throw an error if no API key is provided
    const claude = createClaudeAPI();
    
    // Test basic chat functionality
    const response = await claude.chat(
      'Hello, can you help me understand Hedera blockchain?',
      [],
      'You are a helpful assistant that explains blockchain concepts briefly.'
    );
    
    console.log('✅ Claude API integration successful!');
    console.log('Response:', response.substring(0, 100) + '...');
    
    return true;
  } catch (error) {
    console.log('❌ Claude API integration failed:');
    console.error(error);
    return false;
  }
};

// Uncomment to run test manually:
// testClaudeIntegration();