# GalaChain Documentation MCP Server - Complete Build Specification

## Overview

Build an MCP (Model Context Protocol) server that provides semantic search and retrieval of GalaChain SDK documentation. The server should pre-index documentation at build time and expose tools for querying APIs, searching docs, and retrieving specific class/method information.

## Goals

1. **Fast lookups** - No runtime crawling, pre-built index
2. **Offline capable** - Works without internet after initial build
3. **Minimal dependencies** - No external services (no vector DB APIs, no OpenAI)
4. **TypeScript-aware** - Understands classes, interfaces, methods, decorators
5. **Background indexing** - Server starts immediately, builds index if missing

## Technology Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Database**: sql.js (pure JS SQLite, no native deps)
- **Search**: SQLite FTS5 (full-text search)
- **Build tool**: tsup

## Data Source

Single repository: `https://github.com/GalaChain/sdk`

```
GalaChain/sdk/
├── docs/
│   ├── index.md                    # Main landing
│   ├── galachain.md                # About GalaChain
│   ├── getting-started.md          # Getting started guide
│   ├── from-zero-to-deployment.md  # Full tutorial
│   ├── chaincode-development.md    # Development guide
│   ├── chaincode-testing.md        # Testing guide
│   ├── chaincode-deployment.md     # Deployment guide
│   ├── authorization.md            # Auth patterns
│   ├── chaincode-client.md         # Client usage
│   ├── chain-api-docs/             # TypeDoc: @gala-chain/api
│   │   └── exports.md
│   ├── chain-client-docs/          # TypeDoc: @gala-chain/client
│   │   └── exports.md
│   ├── chain-test-docs/            # TypeDoc: @gala-chain/test
│   │   └── exports.md
│   └── chaincode-docs/             # TypeDoc: @gala-chain/chaincode
│       └── exports.md
├── chain-cli/
│   └── README.md                   # CLI documentation
├── CLAUDE.md                       # AI assistant context
├── BREAKING_CHANGES.md             # Migration info
└── README.md                       # Main readme
```

## Project Structure

```
galachain-docs-mcp/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry point with background indexing
│   ├── server.ts             # MCP server implementation
│   ├── tools/
│   │   ├── search.ts         # search_galachain_docs tool
│   │   ├── get-class.ts      # get_galachain_class tool
│   │   ├── get-method.ts     # get_galachain_method tool
│   │   └── list-modules.ts   # list_galachain_modules tool
│   ├── indexer/
│   │   ├── fetch-docs.ts     # Clone SDK repo from GitHub
│   │   ├── parse-markdown.ts # Parse guide .md files
│   │   ├── parse-typedoc.ts  # Parse TypeDoc markdown output
│   │   └── build-index.ts    # Build SQLite FTS index
│   ├── db/
│   │   ├── wrapper.ts        # sql.js wrapper for better-sqlite3-like API
│   │   ├── schema.ts         # Database schema SQL
│   │   └── queries.ts        # Search query functions
│   └── types.ts              # TypeScript type definitions
├── scripts/
│   └── build-index.ts        # CLI script for manual index rebuild
└── data/
    └── galachain-docs.db     # Pre-built SQLite database (gitignored)
```

## Database Schema

```sql
-- Documentation chunks (guides, tutorials, etc.)
CREATE TABLE docs (
    id INTEGER PRIMARY KEY,
    package TEXT NOT NULL,        -- 'chain-api', 'chaincode', 'guides', 'cli'
    category TEXT NOT NULL,       -- 'guide', 'tutorial', 'api', 'reference'
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    heading_level INTEGER,        -- 1, 2, 3 for h1, h2, h3
    source_url TEXT,
    file_path TEXT
);

-- Classes/Interfaces from TypeDoc output
CREATE TABLE classes (
    id INTEGER PRIMARY KEY,
    package TEXT NOT NULL,        -- 'chain-api', 'chaincode', 'chain-client', 'chain-test'
    name TEXT NOT NULL,           -- 'GalaContract', 'ChainUser', 'TokenBalance'
    type TEXT NOT NULL,           -- 'class', 'interface', 'type', 'enum', 'function'
    description TEXT,
    extends_clause TEXT,          -- Parent class/interface name
    implements_clause TEXT,       -- Implemented interfaces (JSON array)
    decorators TEXT,              -- Decorators used (JSON array)
    source_url TEXT,
    file_path TEXT
);

-- Methods, Properties, Constructors
CREATE TABLE members (
    id INTEGER PRIMARY KEY,
    class_id INTEGER REFERENCES classes(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL,           -- 'method', 'property', 'constructor', 'accessor'
    signature TEXT,               -- Full TypeScript signature
    visibility TEXT,              -- 'public', 'protected', 'private'
    is_static INTEGER DEFAULT 0,
    is_async INTEGER DEFAULT 0,
    description TEXT,
    params TEXT,                  -- JSON array: [{name, type, description, optional}]
    returns TEXT,                 -- {type, description}
    decorators TEXT,              -- JSON array of decorator names
    example_code TEXT
);

-- FTS5 virtual tables for full-text search
CREATE VIRTUAL TABLE docs_fts USING fts5(
    title, content, package, category,
    content='docs',
    content_rowid='id'
);

CREATE VIRTUAL TABLE classes_fts USING fts5(
    name, description, package,
    content='classes',
    content_rowid='id'
);

CREATE VIRTUAL TABLE members_fts USING fts5(
    name, signature, description,
    content='members',
    content_rowid='id'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER docs_ai AFTER INSERT ON docs BEGIN
    INSERT INTO docs_fts(rowid, title, content, package, category)
    VALUES (new.id, new.title, new.content, new.package, new.category);
END;

CREATE TRIGGER classes_ai AFTER INSERT ON classes BEGIN
    INSERT INTO classes_fts(rowid, name, description, package)
    VALUES (new.id, new.name, new.description, new.package);
END;

CREATE TRIGGER members_ai AFTER INSERT ON members BEGIN
    INSERT INTO members_fts(rowid, name, signature, description)
    VALUES (new.id, new.name, new.signature, new.description);
END;
```

## MCP Tools to Implement

### 1. `search_galachain_docs`

Search across all GalaChain SDK documentation.

```typescript
{
  name: "search_galachain_docs",
  description: "Search GalaChain SDK documentation for guides, API references, classes, and code examples",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query (e.g., 'token transfer', 'GalaContract decorator', 'authorization')"
      },
      package: {
        type: "string",
        enum: ["chain-api", "chain-client", "chain-test", "chaincode", "chain-cli", "guides", "all"],
        default: "all",
        description: "Filter by package or documentation type"
      },
      type: {
        type: "string",
        enum: ["all", "guide", "class", "method", "interface"],
        default: "all",
        description: "Filter by content type"
      },
      limit: {
        type: "number",
        default: 5,
        description: "Maximum results to return (1-20)"
      }
    },
    required: ["query"]
  }
}
```

**Returns**: Array of matching results with title, snippet, relevance score, source URL, and type.

### 2. `get_galachain_class`

Get detailed information about a specific class, interface, or type.

```typescript
{
  name: "get_galachain_class",
  description: "Get detailed API reference for a GalaChain class, interface, type, or enum",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Class/interface name (e.g., 'GalaContract', 'TokenBalance', 'ChainCallDTO', 'TokenClass')"
      },
      package: {
        type: "string",
        enum: ["chain-api", "chain-client", "chain-test", "chaincode"],
        description: "Optional: filter by specific package"
      }
    },
    required: ["name"]
  }
}
```

**Returns**: Class metadata, inheritance, all methods/properties with signatures, decorators, and descriptions.

### 3. `get_galachain_method`

Get detailed information about a specific method or function.

```typescript
{
  name: "get_galachain_method",
  description: "Get detailed information about a GalaChain method or function",
  inputSchema: {
    type: "object",
    properties: {
      method_name: {
        type: "string",
        description: "Method name, optionally with class prefix (e.g., 'submit', 'GalaContract.submit', 'createTokenClass')"
      },
      package: {
        type: "string",
        enum: ["chain-api", "chain-client", "chain-test", "chaincode"],
        description: "Optional: filter by specific package"
      }
    },
    required: ["method_name"]
  }
}
```

**Returns**: Method signature, parameters with types and descriptions, return type, decorators, example code if available.

### 4. `list_galachain_modules`

List available classes and interfaces by package.

```typescript
{
  name: "list_galachain_modules",
  description: "List all available classes, interfaces, and types in GalaChain SDK packages",
  inputSchema: {
    type: "object",
    properties: {
      package: {
        type: "string",
        enum: ["chain-api", "chain-client", "chain-test", "chaincode", "all"],
        default: "all",
        description: "Filter by package"
      },
      type: {
        type: "string",
        enum: ["class", "interface", "type", "enum", "function", "all"],
        default: "all",
        description: "Filter by type"
      }
    }
  }
}
```

**Returns**: Organized list of all classes/interfaces grouped by package with brief descriptions.

## sql.js Wrapper Implementation

Create a wrapper that provides a better-sqlite3-like synchronous API:

```typescript
// src/db/wrapper.ts
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SqlJsDatabase;
let dbPath: string;

export async function openDatabase(filePath: string, readonly = false): Promise<void> {
  SQL = await initSqlJs();
  dbPath = filePath;
  
  if (fs.existsSync(filePath)) {
    const buffer = fs.readFileSync(filePath);
    db = new SQL.Database(buffer);
  } else if (!readonly) {
    // Create new database
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new SQL.Database();
  } else {
    throw new Error(`Database not found: ${filePath}`);
  }
}

export function exec(sql: string): void {
  db.run(sql);
}

export function run(sql: string, params: any[] = []): void {
  db.run(sql, params);
}

export function all<T = any>(sql: string, params: any[] = []): T[] {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

export function get<T = any>(sql: string, params: any[] = []): T | undefined {
  const rows = all<T>(sql, params);
  return rows[0];
}

export function save(): void {
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

export function close(): void {
  if (db) {
    save();
    db.close();
  }
}

export function reset(): void {
  if (db) db.close();
  db = new SQL.Database();
}
```

## Indexer Implementation

### Fetch Docs

```typescript
// src/indexer/fetch-docs.ts
import { simpleGit } from 'simple-git';
import fs from 'fs';
import path from 'path';

const REPO_URL = 'https://github.com/GalaChain/sdk.git';
const REPO_DIR = './data/repos/galachain-sdk';

export async function fetchDocs(): Promise<string> {
  const git = simpleGit();
  
  if (fs.existsSync(REPO_DIR)) {
    // Pull latest
    console.error('[galachain-mcp] Updating existing repo...');
    await git.cwd(REPO_DIR).pull();
  } else {
    // Clone fresh (shallow)
    console.error('[galachain-mcp] Cloning GalaChain SDK...');
    fs.mkdirSync(path.dirname(REPO_DIR), { recursive: true });
    await git.clone(REPO_URL, REPO_DIR, ['--depth', '1']);
  }
  
  return REPO_DIR;
}

export function getDocsFiles(repoDir: string): string[] {
  const files: string[] = [];
  
  // Guide markdown files
  const docsDir = path.join(repoDir, 'docs');
  if (fs.existsSync(docsDir)) {
    const entries = fs.readdirSync(docsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(path.join(docsDir, entry.name));
      }
      // TypeDoc directories
      if (entry.isDirectory() && entry.name.endsWith('-docs')) {
        const subDir = path.join(docsDir, entry.name);
        const subEntries = fs.readdirSync(subDir);
        for (const subEntry of subEntries) {
          if (subEntry.endsWith('.md')) {
            files.push(path.join(subDir, subEntry));
          }
        }
      }
    }
  }
  
  // Additional docs
  const additionalFiles = [
    'chain-cli/README.md',
    'CLAUDE.md',
    'BREAKING_CHANGES.md',
    'README.md'
  ];
  
  for (const file of additionalFiles) {
    const fullPath = path.join(repoDir, file);
    if (fs.existsSync(fullPath)) {
      files.push(fullPath);
    }
  }
  
  return files;
}
```

### Parse Markdown

```typescript
// src/indexer/parse-markdown.ts
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import { toString } from 'mdast-util-to-string';
import type { Root, Heading, Code } from 'mdast';

export interface DocChunk {
  title: string;
  content: string;
  headingLevel: number;
  package: string;
  category: string;
  filePath: string;
  sourceUrl: string;
}

export function parseMarkdown(content: string, filePath: string): DocChunk[] {
  const tree = unified().use(remarkParse).parse(content) as Root;
  const chunks: DocChunk[] = [];
  
  const pkg = detectPackage(filePath);
  const category = detectCategory(filePath);
  const sourceUrl = filePathToUrl(filePath);
  
  let currentHeading = '';
  let currentLevel = 1;
  let currentContent: string[] = [];
  
  const saveChunk = () => {
    if (currentHeading && currentContent.length > 0) {
      chunks.push({
        title: currentHeading,
        content: currentContent.join('\n\n'),
        headingLevel: currentLevel,
        package: pkg,
        category,
        filePath,
        sourceUrl
      });
    }
  };
  
  visit(tree, (node) => {
    if (node.type === 'heading') {
      saveChunk();
      currentHeading = toString(node);
      currentLevel = (node as Heading).depth;
      currentContent = [];
    } else if (node.type === 'paragraph') {
      currentContent.push(toString(node));
    } else if (node.type === 'code') {
      const code = node as Code;
      const lang = code.lang || '';
      currentContent.push(`\`\`\`${lang}\n${code.value}\n\`\`\``);
    } else if (node.type === 'list') {
      currentContent.push(toString(node));
    }
  });
  
  saveChunk(); // Save last chunk
  return chunks;
}

function detectPackage(filePath: string): string {
  if (filePath.includes('chain-api-docs')) return 'chain-api';
  if (filePath.includes('chain-client-docs')) return 'chain-client';
  if (filePath.includes('chain-test-docs')) return 'chain-test';
  if (filePath.includes('chaincode-docs')) return 'chaincode';
  if (filePath.includes('chain-cli')) return 'chain-cli';
  return 'guides';
}

function detectCategory(filePath: string): string {
  if (filePath.includes('-docs/')) return 'api';
  if (filePath.includes('getting-started')) return 'tutorial';
  if (filePath.includes('from-zero')) return 'tutorial';
  return 'guide';
}

function filePathToUrl(filePath: string): string {
  // Convert local path to docs.galachain.com URL
  const relativePath = filePath.replace(/.*galachain-sdk\//, '');
  return `https://docs.galachain.com/latest/${relativePath.replace('.md', '/')}`;
}
```

### Parse TypeDoc Markdown

```typescript
// src/indexer/parse-typedoc.ts
import fs from 'fs';

export interface ClassInfo {
  name: string;
  package: string;
  type: 'class' | 'interface' | 'type' | 'enum' | 'function';
  description: string;
  extendsClause: string | null;
  implementsClause: string[];
  decorators: string[];
  members: MemberInfo[];
  filePath: string;
  sourceUrl: string;
}

export interface MemberInfo {
  name: string;
  type: 'method' | 'property' | 'constructor' | 'accessor';
  signature: string;
  visibility: 'public' | 'protected' | 'private';
  isStatic: boolean;
  isAsync: boolean;
  description: string;
  params: ParamInfo[];
  returns: { type: string; description: string } | null;
  decorators: string[];
  exampleCode: string | null;
}

export interface ParamInfo {
  name: string;
  type: string;
  description: string;
  optional: boolean;
}

export function parseTypedocMarkdown(content: string, filePath: string): ClassInfo[] {
  const classes: ClassInfo[] = [];
  const pkg = detectPackageFromPath(filePath);
  
  // TypeDoc exports.md structure:
  // # Module Name
  // ## Classes
  // ### ClassName
  // #### Constructor
  // #### Methods
  // ##### methodName
  
  // Split by ## headings (top-level sections)
  const sections = content.split(/^## /m).slice(1);
  
  for (const section of sections) {
    const lines = section.split('\n');
    const sectionTitle = lines[0]?.trim();
    
    // Parse class/interface sections
    const classMatches = section.matchAll(/^### (\w+)/gm);
    for (const match of classMatches) {
      const className = match[1];
      const classSection = extractSection(section, `### ${className}`);
      
      if (classSection) {
        const classInfo = parseClassSection(className, classSection, pkg, filePath);
        if (classInfo) {
          classes.push(classInfo);
        }
      }
    }
  }
  
  return classes;
}

function parseClassSection(
  name: string, 
  section: string, 
  pkg: string, 
  filePath: string
): ClassInfo | null {
  const lines = section.split('\n');
  
  // Extract description (text before first #### heading)
  const descLines: string[] = [];
  let i = 1; // Skip class name line
  while (i < lines.length && !lines[i].startsWith('####')) {
    if (lines[i].trim()) descLines.push(lines[i]);
    i++;
  }
  
  // Detect type from content or name patterns
  let type: ClassInfo['type'] = 'class';
  if (section.includes('Interface')) type = 'interface';
  if (section.includes('Type alias')) type = 'type';
  if (section.includes('Enumeration')) type = 'enum';
  
  // Extract extends clause
  const extendsMatch = section.match(/Extends[:\s]+`?(\w+)`?/i);
  const extendsClause = extendsMatch ? extendsMatch[1] : null;
  
  // Extract implements
  const implementsMatch = section.match(/Implements[:\s]+(.+)/i);
  const implementsClause = implementsMatch 
    ? implementsMatch[1].split(',').map(s => s.trim().replace(/`/g, ''))
    : [];
  
  // Parse members
  const members = parseMembers(section);
  
  return {
    name,
    package: pkg,
    type,
    description: descLines.join(' ').trim(),
    extendsClause,
    implementsClause,
    decorators: extractDecorators(section),
    members,
    filePath,
    sourceUrl: `https://docs.galachain.com/latest/${pkg.replace('-', '-')}-docs/`
  };
}

function parseMembers(section: string): MemberInfo[] {
  const members: MemberInfo[] = [];
  
  // Find all #### or ##### headings (methods, properties)
  const memberMatches = section.matchAll(/^#{4,5}\s+(\w+)/gm);
  
  for (const match of memberMatches) {
    const memberName = match[1];
    if (['Constructor', 'Methods', 'Properties', 'Accessors'].includes(memberName)) {
      continue; // Skip section headers
    }
    
    const memberSection = extractSection(section, match[0]);
    if (memberSection) {
      const member = parseMemberSection(memberName, memberSection);
      if (member) members.push(member);
    }
  }
  
  return members;
}

function parseMemberSection(name: string, section: string): MemberInfo | null {
  // Extract signature from code block
  const sigMatch = section.match(/```(?:typescript|ts)?\s*\n([^`]+)\n```/);
  const signature = sigMatch ? sigMatch[1].trim() : '';
  
  // Detect member type
  let type: MemberInfo['type'] = 'method';
  if (name === 'constructor') type = 'constructor';
  if (section.includes('property') || !signature.includes('(')) type = 'property';
  if (section.includes('get ') || section.includes('set ')) type = 'accessor';
  
  // Extract description
  const descMatch = section.match(/\n\n([^#`\n][^\n]+)/);
  const description = descMatch ? descMatch[1].trim() : '';
  
  // Parse parameters
  const params = parseParams(section);
  
  // Parse returns
  const returnsMatch = section.match(/Returns[:\s]+`?([^`\n]+)`?(?:\s*[-–]\s*(.+))?/i);
  const returns = returnsMatch 
    ? { type: returnsMatch[1], description: returnsMatch[2] || '' }
    : null;
  
  return {
    name,
    type,
    signature,
    visibility: 'public',
    isStatic: section.includes('static'),
    isAsync: signature.includes('async') || signature.includes('Promise<'),
    description,
    params,
    returns,
    decorators: extractDecorators(section),
    exampleCode: extractCodeExample(section)
  };
}

function parseParams(section: string): ParamInfo[] {
  const params: ParamInfo[] = [];
  
  // Look for Parameters section or inline param docs
  const paramMatches = section.matchAll(/[•\-\*]\s*`(\w+)`(?:\s*\(([^)]+)\))?(?:\s*[-–:]\s*(.+))?/g);
  
  for (const match of paramMatches) {
    params.push({
      name: match[1],
      type: match[2] || 'unknown',
      description: match[3] || '',
      optional: match[0].includes('optional') || match[0].includes('?')
    });
  }
  
  return params;
}

function extractDecorators(section: string): string[] {
  const decorators: string[] = [];
  const matches = section.matchAll(/@(\w+)/g);
  for (const match of matches) {
    if (!decorators.includes(match[1])) {
      decorators.push(match[1]);
    }
  }
  return decorators;
}

function extractCodeExample(section: string): string | null {
  const exampleMatch = section.match(/[Ee]xample[s]?[:\s]*\n```(?:typescript|ts)?\s*\n([^`]+)\n```/);
  return exampleMatch ? exampleMatch[1].trim() : null;
}

function extractSection(content: string, heading: string): string | null {
  const headingLevel = heading.match(/^#+/)?.[0].length || 0;
  const startIndex = content.indexOf(heading);
  if (startIndex === -1) return null;
  
  const afterHeading = content.slice(startIndex + heading.length);
  const nextHeadingMatch = afterHeading.match(new RegExp(`^#{1,${headingLevel}}\\s`, 'm'));
  
  if (nextHeadingMatch) {
    return heading + afterHeading.slice(0, nextHeadingMatch.index);
  }
  return heading + afterHeading;
}

function detectPackageFromPath(filePath: string): string {
  if (filePath.includes('chain-api-docs')) return 'chain-api';
  if (filePath.includes('chain-client-docs')) return 'chain-client';
  if (filePath.includes('chain-test-docs')) return 'chain-test';
  if (filePath.includes('chaincode-docs')) return 'chaincode';
  return 'unknown';
}
```

### Build Index

```typescript
// src/indexer/build-index.ts
import { glob } from 'glob';
import fs from 'fs';
import path from 'path';
import { fetchDocs, getDocsFiles } from './fetch-docs.js';
import { parseMarkdown, DocChunk } from './parse-markdown.js';
import { parseTypedocMarkdown, ClassInfo } from './parse-typedoc.js';
import { openDatabase, exec, run, save, reset } from '../db/wrapper.js';
import { SCHEMA_SQL } from '../db/schema.js';

export async function buildIndex(dbPath: string): Promise<void> {
  console.error('[galachain-mcp] Starting index build...');
  
  // Fetch/update docs
  const repoDir = await fetchDocs();
  
  // Initialize database
  await openDatabase(dbPath, false);
  reset();
  exec(SCHEMA_SQL);
  
  // Get all doc files
  const files = getDocsFiles(repoDir);
  console.error(`[galachain-mcp] Found ${files.length} files to index`);
  
  let docCount = 0;
  let classCount = 0;
  let memberCount = 0;
  
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const relativePath = path.relative(repoDir, file);
    
    // Check if it's a TypeDoc file
    if (file.includes('-docs/')) {
      // Parse TypeDoc markdown
      const classes = parseTypedocMarkdown(content, file);
      for (const cls of classes) {
        insertClass(cls);
        classCount++;
        memberCount += cls.members.length;
      }
    }
    
    // Also parse as regular markdown for search
    const chunks = parseMarkdown(content, file);
    for (const chunk of chunks) {
      insertDoc(chunk);
      docCount++;
    }
  }
  
  // Rebuild FTS indexes
  exec(`INSERT INTO docs_fts(docs_fts) VALUES('rebuild')`);
  exec(`INSERT INTO classes_fts(classes_fts) VALUES('rebuild')`);
  exec(`INSERT INTO members_fts(members_fts) VALUES('rebuild')`);
  
  save();
  
  console.error(`[galachain-mcp] Index complete: ${docCount} docs, ${classCount} classes, ${memberCount} members`);
}

function insertDoc(chunk: DocChunk): void {
  run(
    `INSERT INTO docs (package, category, title, content, heading_level, source_url, file_path)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [chunk.package, chunk.category, chunk.title, chunk.content, chunk.headingLevel, chunk.sourceUrl, chunk.filePath]
  );
}

function insertClass(cls: ClassInfo): void {
  run(
    `INSERT INTO classes (package, name, type, description, extends_clause, implements_clause, decorators, source_url, file_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      cls.package,
      cls.name,
      cls.type,
      cls.description,
      cls.extendsClause,
      JSON.stringify(cls.implementsClause),
      JSON.stringify(cls.decorators),
      cls.sourceUrl,
      cls.filePath
    ]
  );
  
  // Get the inserted class ID
  const classId = getLastInsertId();
  
  // Insert members
  for (const member of cls.members) {
    run(
      `INSERT INTO members (class_id, name, type, signature, visibility, is_static, is_async, description, params, returns, decorators, example_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        classId,
        member.name,
        member.type,
        member.signature,
        member.visibility,
        member.isStatic ? 1 : 0,
        member.isAsync ? 1 : 0,
        member.description,
        JSON.stringify(member.params),
        member.returns ? JSON.stringify(member.returns) : null,
        JSON.stringify(member.decorators),
        member.exampleCode
      ]
    );
  }
}

function getLastInsertId(): number {
  // sql.js doesn't have lastInsertRowId, use MAX(id)
  const result = get<{ id: number }>('SELECT MAX(id) as id FROM classes');
  return result?.id || 0;
}
```

## MCP Server Implementation

```typescript
// src/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { searchGalachainDocs } from './tools/search.js';
import { getGalachainClass } from './tools/get-class.js';
import { getGalachainMethod } from './tools/get-method.js';
import { listGalachainModules } from './tools/list-modules.js';

// Tool definitions
const tools = [
  {
    name: 'search_galachain_docs',
    description: 'Search GalaChain SDK documentation for guides, API references, classes, and code examples',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        package: {
          type: 'string',
          enum: ['chain-api', 'chain-client', 'chain-test', 'chaincode', 'chain-cli', 'guides', 'all'],
          default: 'all'
        },
        type: {
          type: 'string',
          enum: ['all', 'guide', 'class', 'method', 'interface'],
          default: 'all'
        },
        limit: { type: 'number', default: 5 }
      },
      required: ['query']
    }
  },
  {
    name: 'get_galachain_class',
    description: 'Get detailed API reference for a GalaChain class, interface, type, or enum',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Class/interface name' },
        package: {
          type: 'string',
          enum: ['chain-api', 'chain-client', 'chain-test', 'chaincode']
        }
      },
      required: ['name']
    }
  },
  {
    name: 'get_galachain_method',
    description: 'Get detailed information about a GalaChain method or function',
    inputSchema: {
      type: 'object' as const,
      properties: {
        method_name: { type: 'string', description: 'Method name (e.g., "submit" or "GalaContract.submit")' },
        package: {
          type: 'string',
          enum: ['chain-api', 'chain-client', 'chain-test', 'chaincode']
        }
      },
      required: ['method_name']
    }
  },
  {
    name: 'list_galachain_modules',
    description: 'List all available classes, interfaces, and types in GalaChain SDK packages',
    inputSchema: {
      type: 'object' as const,
      properties: {
        package: {
          type: 'string',
          enum: ['chain-api', 'chain-client', 'chain-test', 'chaincode', 'all'],
          default: 'all'
        },
        type: {
          type: 'string',
          enum: ['class', 'interface', 'type', 'enum', 'function', 'all'],
          default: 'all'
        }
      }
    }
  }
];

export function createServer() {
  const server = new Server(
    { name: 'galachain-docs', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'search_galachain_docs':
          return await searchGalachainDocs(args as any);
        case 'get_galachain_class':
          return await getGalachainClass(args as any);
        case 'get_galachain_method':
          return await getGalachainMethod(args as any);
        case 'list_galachain_modules':
          return await listGalachainModules(args as any);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  });

  return server;
}
```

## Entry Point with Background Indexing

```typescript
// src/index.ts
#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from './server.js';
import { openDatabase } from './db/wrapper.js';
import { buildIndex } from './indexer/build-index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'galachain-docs.db');

// Index status for tool responses
let indexStatus: 'ready' | 'building' | 'error' = 'ready';
let indexError: string | null = null;

export function getIndexStatus() {
  return { status: indexStatus, error: indexError };
}

async function main() {
  // Check for --rebuild flag
  if (process.argv.includes('--rebuild')) {
    console.error('[galachain-mcp] Rebuilding index...');
    await buildIndex(DB_PATH);
    console.error('[galachain-mcp] Done.');
    process.exit(0);
  }

  // Check if index exists
  if (!existsSync(DB_PATH)) {
    // Start background indexing
    indexStatus = 'building';
    console.error('[galachain-mcp] Index not found, building in background...');
    
    buildIndex(DB_PATH)
      .then(() => {
        indexStatus = 'ready';
        console.error('[galachain-mcp] Index ready.');
        // Reopen database
        return openDatabase(DB_PATH, true);
      })
      .catch((err) => {
        indexStatus = 'error';
        indexError = err.message;
        console.error(`[galachain-mcp] Index build failed: ${err}`);
      });
  } else {
    // Open existing database
    await openDatabase(DB_PATH, true);
  }

  // Start MCP server immediately
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[galachain-mcp] Fatal error:', error);
  process.exit(1);
});
```

## Search Queries Implementation

```typescript
// src/db/queries.ts
import { all, get } from './wrapper.js';
import { getIndexStatus } from '../index.js';

export interface SearchResult {
  id: number;
  title: string;
  snippet: string;
  package: string;
  category: string;
  type: string;
  sourceUrl: string;
  rank: number;
}

export function searchDocs(
  query: string,
  pkg: string = 'all',
  type: string = 'all',
  limit: number = 5
): SearchResult[] {
  // Convert query to FTS5 format
  const ftsQuery = query
    .split(/\s+/)
    .filter(t => t.length > 0)
    .map(t => `"${t}"*`)
    .join(' ');

  const results: SearchResult[] = [];

  // Search docs
  if (type === 'all' || type === 'guide') {
    const docResults = all<any>(`
      SELECT 
        d.id,
        d.title,
        snippet(docs_fts, 1, '**', '**', '...', 40) as snippet,
        d.package,
        d.category,
        'doc' as type,
        d.source_url as sourceUrl,
        bm25(docs_fts) as rank
      FROM docs_fts
      JOIN docs d ON docs_fts.rowid = d.id
      WHERE docs_fts MATCH ?
        AND (? = 'all' OR d.package = ?)
      ORDER BY rank
      LIMIT ?
    `, [ftsQuery, pkg, pkg, limit]);
    
    results.push(...docResults);
  }

  // Search classes
  if (type === 'all' || type === 'class' || type === 'interface') {
    const classResults = all<any>(`
      SELECT 
        c.id,
        c.name as title,
        snippet(classes_fts, 1, '**', '**', '...', 40) as snippet,
        c.package,
        c.type as category,
        'class' as type,
        c.source_url as sourceUrl,
        bm25(classes_fts) as rank
      FROM classes_fts
      JOIN classes c ON classes_fts.rowid = c.id
      WHERE classes_fts MATCH ?
        AND (? = 'all' OR c.package = ?)
        AND (? = 'all' OR c.type = ?)
      ORDER BY rank
      LIMIT ?
    `, [ftsQuery, pkg, pkg, type, type, limit]);
    
    results.push(...classResults);
  }

  // Search members/methods
  if (type === 'all' || type === 'method') {
    const memberResults = all<any>(`
      SELECT 
        m.id,
        c.name || '.' || m.name as title,
        snippet(members_fts, 1, '**', '**', '...', 40) as snippet,
        c.package,
        m.type as category,
        'method' as type,
        c.source_url as sourceUrl,
        bm25(members_fts) as rank
      FROM members_fts
      JOIN members m ON members_fts.rowid = m.id
      JOIN classes c ON m.class_id = c.id
      WHERE members_fts MATCH ?
        AND (? = 'all' OR c.package = ?)
      ORDER BY rank
      LIMIT ?
    `, [ftsQuery, pkg, pkg, limit]);
    
    results.push(...memberResults);
  }

  // Sort all results by rank and limit
  return results
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit);
}

export function getClass(name: string, pkg?: string) {
  const cls = get<any>(`
    SELECT * FROM classes 
    WHERE name = ? 
      AND (? IS NULL OR package = ?)
  `, [name, pkg || null, pkg || null]);

  if (!cls) return null;

  const members = all<any>(`
    SELECT * FROM members WHERE class_id = ?
  `, [cls.id]);

  return {
    ...cls,
    implementsClause: JSON.parse(cls.implements_clause || '[]'),
    decorators: JSON.parse(cls.decorators || '[]'),
    members: members.map(m => ({
      ...m,
      params: JSON.parse(m.params || '[]'),
      returns: m.returns ? JSON.parse(m.returns) : null,
      decorators: JSON.parse(m.decorators || '[]'),
      isStatic: !!m.is_static,
      isAsync: !!m.is_async
    }))
  };
}

export function getMethod(methodName: string, pkg?: string) {
  // Handle "ClassName.methodName" format
  let className: string | null = null;
  let mName = methodName;
  
  if (methodName.includes('.')) {
    [className, mName] = methodName.split('.', 2);
  }

  const sql = `
    SELECT m.*, c.name as class_name, c.package, c.source_url
    FROM members m
    JOIN classes c ON m.class_id = c.id
    WHERE m.name = ?
      AND (? IS NULL OR c.name = ?)
      AND (? IS NULL OR c.package = ?)
  `;

  const results = all<any>(sql, [mName, className, className, pkg || null, pkg || null]);

  return results.map(m => ({
    ...m,
    params: JSON.parse(m.params || '[]'),
    returns: m.returns ? JSON.parse(m.returns) : null,
    decorators: JSON.parse(m.decorators || '[]'),
    isStatic: !!m.is_static,
    isAsync: !!m.is_async
  }));
}

export function listModules(pkg: string = 'all', type: string = 'all') {
  return all<any>(`
    SELECT name, package, type, description
    FROM classes
    WHERE (? = 'all' OR package = ?)
      AND (? = 'all' OR type = ?)
    ORDER BY package, type, name
  `, [pkg, pkg, type, type]);
}
```

## Package.json

```json
{
  "name": "galachain-docs-mcp",
  "version": "1.0.0",
  "description": "MCP server for GalaChain SDK documentation search and retrieval",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "galachain-docs-mcp": "./dist/index.js"
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --clean",
    "build:index": "tsx scripts/build-index.ts",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "prepublishOnly": "npm run build"
  },
  "files": [
    "dist",
    "data/.gitkeep"
  ],
  "keywords": [
    "mcp",
    "galachain",
    "documentation",
    "search",
    "claude"
  ],
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "glob": "^10.0.0",
    "simple-git": "^3.0.0",
    "sql.js": "^1.11.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "mdast-util-to-string": "^4.0.0",
    "remark-parse": "^11.0.0",
    "tsup": "^8.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "unified": "^11.0.0",
    "unist-util-visit": "^5.0.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "data"]
}
```

## Usage

### Installation

```bash
# Via npx (recommended)
npx galachain-docs-mcp

# Or install globally
npm install -g galachain-docs-mcp
galachain-docs-mcp
```

### Claude Code Configuration

Add to your MCP settings:

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
  "permissions": [
    "mcp__galachain-docs__*"
  ]
}
```

### CLI Options

```bash
# Normal start (builds index if missing)
galachain-docs-mcp

# Force rebuild index
galachain-docs-mcp --rebuild
```

## Testing

Use MCP inspector:

```bash
npx @modelcontextprotocol/inspector npx galachain-docs-mcp
```

Test queries:
- `search_galachain_docs({ query: "token transfer" })`
- `search_galachain_docs({ query: "GalaContract", type: "class" })`
- `get_galachain_class({ name: "GalaContract" })`
- `get_galachain_class({ name: "TokenBalance", package: "chain-api" })`
- `get_galachain_method({ method_name: "submit" })`
- `get_galachain_method({ method_name: "GalaContract.submit" })`
- `list_galachain_modules({ package: "chaincode" })`
- `list_galachain_modules({ type: "interface" })`

## Key GalaChain Concepts to Index Well

Ensure these are well-indexed for search:

1. **Core Classes** (chaincode package):
   - `GalaContract` - Base contract class
   - `GalaChainContext` - Transaction context
   - `Submit`, `Evaluate` - Transaction decorators

2. **Data Types** (chain-api package):
   - `ChainUser` - User identity
   - `TokenBalance` - Token balances
   - `TokenClass` - Token definitions
   - `TokenInstance` - NFT instances
   - `ChainCallDTO` - Base DTO

3. **Testing** (chain-test package):
   - `ChainCodeFixture` - Test fixture
   - Testing patterns

4. **Client** (chain-client package):
   - Client initialization
   - Transaction signing
   - API calls

## Build Steps Summary

1. Initialize project: `npm init`, install dependencies
2. Create sql.js wrapper for database access
3. Create database schema with FTS5
4. Build indexer:
   - Fetch docs from GitHub
   - Parse Markdown guides
   - Parse TypeDoc API references
   - Populate database
5. Implement MCP server with 4 tools
6. Add background indexing on first start
7. Test with MCP inspector
8. Publish to npm

## Start Now

Begin with Phase 1: Create the project directory and `package.json`. Then implement each component in order. The sql.js wrapper and background indexing pattern are the most important pieces to get right first.