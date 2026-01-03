import fs from 'fs';
import { fetchDocs, getDocsFiles } from './fetch-docs.js';
import { parseMarkdown } from './parse-markdown.js';
import { parseTypedocMarkdown } from './parse-typedoc.js';
import { openDatabase, exec, run, save, reset, getLastInsertId } from '../db/wrapper.js';
import { SCHEMA_SQL } from '../db/schema.js';
import type { DocChunk, ClassInfo } from '../types.js';

export async function buildIndex(dbPath: string): Promise<void> {
  console.error('[galachain-mcp] Starting index build...');

  // Fetch/update docs
  const repoDir = await fetchDocs();

  // Initialize database
  await openDatabase(dbPath, false);
  reset();

  // Execute schema - split by statement for sql.js
  const statements = SCHEMA_SQL.split(';').filter((s) => s.trim());
  for (const stmt of statements) {
    if (stmt.trim()) {
      exec(stmt.trim() + ';');
    }
  }

  // Get all doc files
  const files = getDocsFiles(repoDir);
  console.error(`[galachain-mcp] Found ${files.length} files to index`);

  let docCount = 0;
  let classCount = 0;
  let memberCount = 0;

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');

      // Check if it's a TypeDoc file
      if (file.includes('-docs/')) {
        // Parse TypeDoc markdown for classes/interfaces
        const classes = parseTypedocMarkdown(content, file);
        for (const cls of classes) {
          insertClass(cls);
          classCount++;
          memberCount += cls.members.length;
        }
      }

      // Also parse as regular markdown for search (all files)
      const chunks = parseMarkdown(content, file);
      for (const chunk of chunks) {
        insertDoc(chunk);
        docCount++;
      }
    } catch (error) {
      console.error(`[galachain-mcp] Error processing ${file}:`, error);
    }
  }

  // Save database
  save();

  console.error(
    `[galachain-mcp] Index complete: ${docCount} docs, ${classCount} classes, ${memberCount} members`
  );
}

function insertDoc(chunk: DocChunk): void {
  // Create search text from title and content
  const searchText = `${chunk.title} ${chunk.content}`.toLowerCase();

  run(
    `INSERT INTO docs (package, category, title, content, heading_level, source_url, file_path, search_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [chunk.package, chunk.category, chunk.title, chunk.content, chunk.headingLevel, chunk.sourceUrl, chunk.filePath, searchText]
  );
}

function insertClass(cls: ClassInfo): void {
  // Create search text from name, description, and decorators
  const searchText = `${cls.name} ${cls.description || ''} ${cls.decorators.join(' ')}`.toLowerCase();

  run(
    `INSERT INTO classes (package, name, type, description, extends_clause, implements_clause, decorators, source_url, file_path, search_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      cls.package,
      cls.name,
      cls.type,
      cls.description,
      cls.extendsClause,
      JSON.stringify(cls.implementsClause),
      JSON.stringify(cls.decorators),
      cls.sourceUrl,
      cls.filePath,
      searchText
    ]
  );

  // Get the inserted class ID
  const classId = getLastInsertId();

  // Insert members
  for (const member of cls.members) {
    // Create search text for member
    const memberSearchText = `${member.name} ${member.signature || ''} ${member.description || ''} ${member.decorators.join(' ')}`.toLowerCase();

    run(
      `INSERT INTO members (class_id, name, type, signature, visibility, is_static, is_async, description, params, returns, decorators, example_code, search_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        member.exampleCode,
        memberSearchText
      ]
    );
  }
}
