#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from './server.js';
import { openDatabase, isOpen } from './db/wrapper.js';
import { buildIndex } from './indexer/build-index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'galachain-docs.db');

// Index status for tool responses
let indexStatus: 'ready' | 'building' | 'error' = 'ready';
let indexError: string | null = null;

export function getIndexStatus(): { status: typeof indexStatus; error: string | null } {
  return { status: indexStatus, error: indexError };
}

async function main() {
  // Check for --rebuild flag
  if (process.argv.includes('--rebuild')) {
    console.error('[galachain-mcp] Rebuilding index...');
    try {
      await buildIndex(DB_PATH);
      console.error('[galachain-mcp] Done.');
    } catch (error) {
      console.error('[galachain-mcp] Build failed:', error);
      process.exit(1);
    }
    process.exit(0);
  }

  // Check if index exists
  if (!existsSync(DB_PATH)) {
    // Start background indexing
    indexStatus = 'building';
    console.error('[galachain-mcp] Index not found, building in background...');

    buildIndex(DB_PATH)
      .then(async () => {
        console.error('[galachain-mcp] Index ready.');
        try {
          await openDatabase(DB_PATH, true);
          indexStatus = 'ready';
        } catch (err) {
          indexStatus = 'error';
          indexError = err instanceof Error ? err.message : String(err);
          console.error(`[galachain-mcp] Failed to open database: ${indexError}`);
        }
      })
      .catch((err) => {
        indexStatus = 'error';
        indexError = err instanceof Error ? err.message : String(err);
        console.error(`[galachain-mcp] Index build failed: ${indexError}`);
      });
  } else {
    // Open existing database
    try {
      await openDatabase(DB_PATH, true);
      indexStatus = 'ready';
    } catch (err) {
      indexStatus = 'error';
      indexError = err instanceof Error ? err.message : String(err);
      console.error(`[galachain-mcp] Failed to open database: ${indexError}`);
    }
  }

  // Start MCP server immediately (even while index is building)
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[galachain-mcp] Fatal error:', error);
  process.exit(1);
});
