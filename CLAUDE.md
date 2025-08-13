# Claude Code Instructions

## Git Commit Guidelines

- Do NOT add agent attribution lines like "🤖 Generated with Claude Code" or "Co-Authored-By: Claude" to commit messages
- Keep commit messages professional and focused on the changes made
- Use conventional commit format when appropriate (feat:, fix:, docs:, etc.)

## Code Style

- Follow existing code patterns and conventions in the project
- Use Prettier for formatting (run `npm run format`)
- Ensure all TypeScript code passes linting

## MCP Server Best Practices

- Return processed data, not raw queries
- No direct SQL execution exposed to clients
- All data validation happens server-side
- Maintain proper error handling and security