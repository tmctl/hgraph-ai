# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Install all dependencies (frontend + backend)
npm i

# Start development server only (runs on port 8080)
npm run dev

# Start backend server only (runs on port 3001)
npm run dev:server

# Start both frontend and backend simultaneously
npm run dev:full

# Build for production
npm run build

# Build for development
npm run build:dev

# Lint code
npm run lint

# Preview production build
npm run preview

# Start backend server in production mode
npm run server:start
```

## Architecture Overview

This is a React-based web application built with modern tooling:

- **Framework**: Vite + React 18 with TypeScript
- **UI Components**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens and animations
- **Routing**: React Router DOM with file-based page structure
- **State Management**: TanStack Query for server state
- **Build Tool**: Vite with SWC for fast compilation

### Project Structure

```
src/
├── components/           # React components
│   ├── ui/              # shadcn/ui component library
│   └── [feature components]
├── pages/               # Route-based pages
├── hooks/               # Custom React hooks
├── lib/                 # Utility functions
└── assets/              # Static assets (images, etc.)
```

### Key Architecture Patterns

- **Component Library**: Uses shadcn/ui components as building blocks
- **Path Aliases**: `@/*` maps to `./src/*` for cleaner imports
- **CSS Variables**: Custom design tokens defined in Tailwind config
- **Route Structure**: Each page in `src/pages/` corresponds to a route
- **Provider Pattern**: App wrapped with QueryClient and TooltipProvider

### Claude API Integration

The application integrates with Claude API through a backend proxy for AI-powered chat functionality:

**Backend Proxy (`server.js`)**:

- **Setup**: Copy `.env.server.example` to `.env` and add your Claude API key
- **Server**: Express.js proxy server that handles Claude API calls (merged into main project)
- **Endpoints**: `/health` (health check), `/api/claude` (Claude API proxy)
- **CORS**: Configured to accept requests from frontend localhost:8080
- **MCP Integration**: Connected via stdio transport to MCP server for enhanced context

**Frontend Integration**:

- **Environment**: Copy `.env.example` to `.env` and set `VITE_API_BASE_URL=http://localhost:3001`
- **API Service**: `src/lib/claude.ts` - Client for backend proxy
- **React Hook**: `src/hooks/useClaude.ts` - React hook for easy Claude integration
- **Components**: Both `ChatHero` and `ChatInterface` components use Claude API
- **Error Handling**: Built-in error handling with user-friendly messages
- **System Prompts**: Specialized for Hedera blockchain analysis queries

**Development Setup**:

1. Install all dependencies: `npm i`
2. Set up backend environment: `cp .env.server.example .env` and add Claude API key
3. Set up frontend environment: `cp .env.example .env` (default values should work)
4. Start both servers: `npm run dev:full`

### Development Notes

- Development server runs on `localhost:8080`
- TypeScript configuration allows implicit any and unused parameters
- Uses Bun for package management (lockfile present)
- Includes component tagger for development workflow
- Custom Tailwind extensions for gradients, shadows, and animations
- Claude API key required for chat functionality (see `.env.example`)
