# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GalaChain Docs MCP Server - An MCP (Model Context Protocol) server that indexes and searches GalaChain SDK documentation using a local SQLite database. Provides offline-capable documentation retrieval for Claude AI assistants.

## Build Commands

```bash
npm run build          # Build TypeScript to ESM with tsup
npm run build:index    # Rebuild documentation index from source
npm run dev            # Watch mode development with tsx
npm start              # Run compiled server from dist/index.js
```

### Runtime Flags

```bash
node dist/index.js --rebuild   # Force rebuild the documentation index
```

### Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector npx galachain-docs-mcp
```

## Architecture

```
src/
├── index.ts              # Entry point with background indexing & CLI flags
├── server.ts             # MCP server implementation & tool definitions
├── types.ts              # TypeScript interfaces (DocChunk, ClassInfo, etc.)
├── db/
│   ├── wrapper.ts        # sql.js database abstraction (sync-like API)
│   ├── schema.ts         # Database schema with CREATE TABLE statements
│   └── queries.ts        # Search & retrieval query functions
├── indexer/
│   ├── fetch-docs.ts     # Clone/update GalaChain SDK repo from GitHub
│   ├── parse-markdown.ts # Parse guide docs (unified/remark-parse)
│   ├── parse-typedoc.ts  # Parse TypeDoc exports for classes/methods
│   └── build-index.ts    # Orchestrate full indexing pipeline
└── tools/                # MCP tool implementations
    ├── search.ts         # search_galachain_docs
    ├── get-class.ts      # get_galachain_class
    ├── get-method.ts     # get_galachain_method
    └── list-modules.ts   # list_galachain_modules
```

## Key Patterns

### ESM-Only
This is a pure ESM project (no CommonJS). All imports must use `.js` extensions even for TypeScript files.

### Background Indexing
The server starts immediately while the index builds asynchronously. Tools check `getIndexStatus()` and report "building" status if the index isn't ready.

### sql.js Wrapper
The `db/wrapper.ts` provides a synchronous-looking API around sql.js (pure JS SQLite). The database is kept in memory and saved to disk on changes.

### Indexing Pipeline
1. `fetch-docs.ts` - Shallow clones/pulls GalaChain SDK from GitHub
2. `parse-markdown.ts` - Splits markdown by headings into searchable chunks
3. `parse-typedoc.ts` - Extracts class/interface/method info from TypeDoc output
4. `build-index.ts` - Orchestrates the pipeline and populates SQLite

## Database Schema

Three main tables:
- **docs** - Markdown documentation chunks (guides, tutorials)
- **classes** - TypeDoc-extracted classes/interfaces/types/enums
- **members** - Class methods, properties, constructors

Search uses LIKE-based pattern matching on the `search_text` field.

## MCP Tools

| Tool | Purpose |
|------|---------|
| `search_galachain_docs` | Search guides, API references, classes, methods |
| `get_galachain_class` | Get full class details with all members |
| `get_galachain_method` | Get method details (with or without class prefix) |
| `list_galachain_modules` | Browse modules by package and type |

## Data Locations

- `data/galachain-docs.db` - Pre-built SQLite index (gitignored)
- `data/repos/galachain-sdk/` - Cloned source repo (gitignored)
- `dist/` - Compiled output (gitignored)
