#!/usr/bin/env tsx
import path from 'path';
import { fileURLToPath } from 'url';
import { buildIndex } from '../src/indexer/build-index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'galachain-docs.db');

async function main() {
  console.error('[build-index] Building GalaChain documentation index...');
  const start = Date.now();

  try {
    await buildIndex(DB_PATH);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`[build-index] Done in ${elapsed}s`);
  } catch (error) {
    console.error('[build-index] Failed:', error);
    process.exit(1);
  }
}

main();
