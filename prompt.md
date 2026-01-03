# Claude Code Prompt: Build GalaChain Docs MCP Server

Copy this entire prompt into Claude Code to start building:

---

## Task

Build a complete MCP server that indexes and searches GalaChain SDK documentation. The server should work offline after initial setup (no external APIs required at runtime). Use sql.js for SQLite (no native dependencies).

## Specification

Read the full specification at: `./galachain-mcp-complete-spec.md`

## Step-by-Step Implementation Order

### Phase 1: Project Setup

1. Create new directory `galachain-docs-mcp`
2. Initialize with `package.json`:
```json
{
  "name": "galachain-docs-mcp",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "bin": { "galachain-docs-mcp": "./dist/index.js" }
}
```
3. Install dependencies:
   - `@modelcontextprotocol/sdk` - MCP protocol
   - `sql.js` - Pure JS SQLite (no native deps!)
   - `glob` - File discovery
   - `simple-git` - Clone repos
4. Install dev dependencies:
   - `unified`, `remark-parse`, `unist-util-visit`, `mdast-util-to-string` - Parse Markdown
   - `tsx`, `tsup`, `typescript`, `@types/node`
5. Create `tsconfig.json` (ESM, ES2022, strict)

### Phase 2: sql.js Database Wrapper

Create `src/db/wrapper.ts`:
- `openDatabase(path, readonly)` - Initialize sql.js and load/create DB
- `exec(sql)` - Run DDL statements
- `run(sql, params)` - Insert/update with parameters
- `all<T>(sql, params)` - Query returning array of objects
- `get<T>(sql, params)` - Query returning single object
- `save()` - Write database to file
- `close()` - Save and close
- `reset()` - Create fresh empty database

Key difference from better-sqlite3: sql.js is async to initialize but queries are sync.

### Phase 3: Database Schema

Create `src/db/schema.ts` with SQL for:
- `docs` table: id, package, category, title, content, heading_level, source_url, file_path
- `classes` table: id, package, name, type, description, extends_clause, implements_clause (JSON), decorators (JSON), source_url
- `members` table: id, class_id, name, type, signature, visibility, is_static, is_async, description, params (JSON), returns (JSON), decorators (JSON), example_code
- FTS5 virtual tables: `docs_fts`, `classes_fts`, `members_fts`
- Triggers to keep FTS in sync on INSERT

### Phase 4: Indexer - Fetch Docs

Create `src/indexer/fetch-docs.ts`:
- Clone `https://github.com/GalaChain/sdk.git` (shallow, depth 1)
- Save to `./data/repos/galachain-sdk/`
- If exists, pull latest instead of clone
- Return list of files to index:
  - `docs/*.md` - Guide files
  - `docs/*-docs/*.md` - TypeDoc output
  - `chain-cli/README.md`
  - `CLAUDE.md`, `BREAKING_CHANGES.md`, `README.md`

### Phase 5: Indexer - Parse Markdown

Create `src/indexer/parse-markdown.ts`:
- Use `unified` + `remark-parse` to parse Markdown AST
- Split content by headings (h1, h2, h3)
- Extract: title, content, heading level, code blocks
- Detect package from file path:
  - `chain-api-docs` → "chain-api"
  - `chaincode-docs` → "chaincode"
  - etc.
  - Other docs → "guides"
- Detect category: "guide", "tutorial", "api"
- Return array of DocChunk objects

### Phase 6: Indexer - Parse TypeDoc

Create `src/indexer/parse-typedoc.ts`:
- Parse TypeDoc-generated markdown from `*-docs/exports.md`
- Extract class/interface definitions (## and ### headings)
- For each class, extract:
  - Name, type (class/interface/type/enum)
  - Description
  - Extends/implements clauses
  - Decorators (@Submit, @Evaluate, etc.)
- For each member (#### and ##### headings):
  - Name, type (method/property/constructor)
  - Signature from code blocks
  - Parameters, return types
  - Description
- Return array of ClassInfo objects with nested MemberInfo

### Phase 7: Indexer - Build Index

Create `src/indexer/build-index.ts`:
- Fetch docs from GitHub
- Initialize fresh database with schema
- Process all markdown files → insert into docs table
- Process TypeDoc files → insert into classes and members tables
- Rebuild FTS indexes
- Save database
- Log statistics

Create `scripts/build-index.ts`:
- CLI wrapper that calls buildIndex()

### Phase 8: Database Queries

Create `src/db/queries.ts`:

```typescript
function searchDocs(query, pkg, type, limit) {
  // FTS5 search across docs, classes, and members
  // Combine results, sort by BM25 rank
  // Return unified SearchResult array
}

function getClass(name, pkg?) {
  // Get class with all members
  // Parse JSON fields (implements, decorators, params)
}

function getMethod(methodName, pkg?) {
  // Handle "ClassName.methodName" format
  // Return method(s) with full details
}

function listModules(pkg, type) {
  // List all classes/interfaces filtered by package and type
}
```

FTS5 query conversion:
```typescript
const ftsQuery = query.split(/\s+/).map(t => `"${t}"*`).join(' ');
```

### Phase 9: MCP Tools

Create tool implementations in `src/tools/`:

1. `search.ts` - `search_galachain_docs`
   - Input: query (required), package, type, limit
   - Check index status, return "building" message if not ready
   - Call searchDocs(), format results

2. `get-class.ts` - `get_galachain_class`
   - Input: name (required), package
   - Call getClass(), format full class with all members

3. `get-method.ts` - `get_galachain_method`
   - Input: method_name (required), package
   - Parse "Class.method" format
   - Call getMethod(), format results

4. `list-modules.ts` - `list_galachain_modules`
   - Input: package, type
   - Call listModules(), group by package

### Phase 10: MCP Server

Create `src/server.ts`:
- Initialize MCP Server with name "galachain-docs"
- Define all 4 tools with JSON schemas
- Handle ListToolsRequest → return tool definitions
- Handle CallToolRequest → route to tool implementations
- Wrap responses in `{ content: [{ type: 'text', text: ... }] }`

Create `src/index.ts`:
- Add shebang: `#!/usr/bin/env node`
- Check for `--rebuild` flag → run buildIndex() and exit
- Check if database exists:
  - If not: set status="building", start background buildIndex()
  - If yes: open database readonly
- Create StdioServerTransport
- Connect server and run
- Export `getIndexStatus()` for tools to check

### Phase 11: Package & Test

1. Build scripts in package.json:
   - `build`: `tsup src/index.ts --format esm --dts --clean`
   - `build:index`: `tsx scripts/build-index.ts`
   - `dev`: `tsx watch src/index.ts`
   - `start`: `node dist/index.js`

2. Create `data/.gitkeep` and add `data/*.db` to `.gitignore`

3. Test with MCP inspector:
   ```bash
   npm run build
   npx @modelcontextprotocol/inspector node dist/index.js
   ```

4. Test queries:
   - `search_galachain_docs({ query: "token" })`
   - `get_galachain_class({ name: "GalaContract" })`
   - `get_galachain_method({ method_name: "submit" })`
   - `list_galachain_modules({ package: "chaincode" })`

## Key Code Snippets

### sql.js Initialization

```typescript
import initSqlJs from 'sql.js';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SqlJsDatabase;

export async function openDatabase(path: string) {
  SQL = await initSqlJs();
  if (fs.existsSync(path)) {
    const buffer = fs.readFileSync(path);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
}
```

### Background Indexing Pattern

```typescript
let indexStatus: 'ready' | 'building' | 'error' = 'ready';

if (!existsSync(DB_PATH)) {
  indexStatus = 'building';
  buildIndex(DB_PATH)
    .then(() => { indexStatus = 'ready'; openDatabase(DB_PATH, true); })
    .catch((err) => { indexStatus = 'error'; indexError = err.message; });
}
```

### Tool Response When Building

```typescript
if (getIndexStatus().status === 'building') {
  return {
    content: [{
      type: 'text',
      text: 'Index is building (~60s on first run). Please wait and try again.'
    }]
  };
}
```

## GalaChain Package Mapping

| Path Pattern | Package Name |
|--------------|--------------|
| `chain-api-docs/` | chain-api |
| `chain-client-docs/` | chain-client |
| `chain-test-docs/` | chain-test |
| `chaincode-docs/` | chaincode |
| `chain-cli/` | chain-cli |
| Other `docs/*.md` | guides |

## Expected Output

When complete, you should be able to:

1. Run `npm run build` to compile
2. Run `npx galachain-docs-mcp` - it builds index on first run
3. Add to Claude Code and search:
   - "How do I create a token in GalaChain?"
   - "Show me the GalaContract class"
   - "What decorators are available for transactions?"

## MCP Config for Claude Code

```json
{
  "mcpServers": {
    "galachain-docs": {
      "command": "npx",
      "args": ["-y", "galachain-docs-mcp"]
    }
  }
}
```

Permissions:
```json
{
  "permissions": ["mcp__galachain-docs__*"]
}
```

## Start Now

Begin with Phase 1. Create the project directory and initialize package.json. Then work through each phase in order. Ask me if you need clarification on any phase.