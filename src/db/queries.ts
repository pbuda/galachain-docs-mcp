import { all, get } from './wrapper.js';
import type { SearchResult, ClassWithMembers, MemberWithDetails, ParamInfo } from '../types.js';

interface DocRow {
  id: number;
  title: string;
  content: string;
  package: string;
  category: string;
  source_url: string;
}

interface ClassRow {
  id: number;
  name: string;
  package: string;
  type: string;
  description: string;
  extends_clause: string | null;
  implements_clause: string;
  decorators: string;
  source_url: string;
  file_path: string;
}

interface MemberRow {
  id: number;
  class_id: number;
  name: string;
  type: string;
  signature: string;
  visibility: string;
  is_static: number;
  is_async: number;
  description: string;
  params: string;
  returns: string | null;
  decorators: string;
  example_code: string | null;
  class_name?: string;
  package?: string;
  source_url?: string;
}

/**
 * Search documents, classes, and members using LIKE-based search
 */
export function searchDocs(
  query: string,
  pkg: string = 'all',
  type: string = 'all',
  limit: number = 5
): SearchResult[] {
  // Prepare search terms for LIKE query
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (terms.length === 0) {
    return [];
  }

  const results: SearchResult[] = [];

  // Search docs
  if (type === 'all' || type === 'guide') {
    try {
      // Build LIKE conditions for each term
      const likeConditions = terms.map(() => `search_text LIKE ?`).join(' AND ');
      const likeParams = terms.map((t) => `%${t}%`);

      const docResults = all<DocRow>(
        `
        SELECT
          id,
          title,
          content,
          package,
          category,
          source_url
        FROM docs
        WHERE (${likeConditions})
          AND (? = 'all' OR package = ?)
        LIMIT ?
      `,
        [...likeParams, pkg, pkg, limit]
      );

      for (const row of docResults) {
        results.push({
          id: row.id,
          title: row.title,
          snippet: createSnippet(row.content, terms),
          package: row.package,
          category: row.category,
          type: 'doc',
          sourceUrl: row.source_url,
          rank: calculateRelevance(row.title + ' ' + row.content, terms)
        });
      }
    } catch (e) {
      console.error('[galachain-mcp] Doc search error:', e);
    }
  }

  // Search classes
  if (type === 'all' || type === 'class' || type === 'interface') {
    try {
      const likeConditions = terms.map(() => `search_text LIKE ?`).join(' AND ');
      const likeParams = terms.map((t) => `%${t}%`);

      const classResults = all<ClassRow>(
        `
        SELECT
          id,
          name,
          package,
          type,
          description,
          source_url
        FROM classes
        WHERE (${likeConditions})
          AND (? = 'all' OR package = ?)
          AND (? = 'all' OR ? = 'class' OR type = ?)
        LIMIT ?
      `,
        [...likeParams, pkg, pkg, type, type, type, limit]
      );

      for (const row of classResults) {
        results.push({
          id: row.id,
          title: row.name,
          snippet: row.description ? createSnippet(row.description, terms) : `${row.type} in ${row.package}`,
          package: row.package,
          category: row.type,
          type: 'class',
          sourceUrl: row.source_url,
          rank: calculateRelevance(row.name + ' ' + (row.description || ''), terms)
        });
      }
    } catch (e) {
      console.error('[galachain-mcp] Class search error:', e);
    }
  }

  // Search members/methods
  if (type === 'all' || type === 'method') {
    try {
      const likeConditions = terms.map(() => `m.search_text LIKE ?`).join(' AND ');
      const likeParams = terms.map((t) => `%${t}%`);

      const memberResults = all<MemberRow & { class_name: string }>(
        `
        SELECT
          m.id,
          m.name,
          m.type,
          m.signature,
          m.description,
          c.name as class_name,
          c.package,
          c.source_url
        FROM members m
        JOIN classes c ON m.class_id = c.id
        WHERE (${likeConditions})
          AND (? = 'all' OR c.package = ?)
        LIMIT ?
      `,
        [...likeParams, pkg, pkg, limit]
      );

      for (const row of memberResults) {
        results.push({
          id: row.id,
          title: `${row.class_name}.${row.name}`,
          snippet: row.description
            ? createSnippet(row.description, terms)
            : row.signature || `${row.type} in ${row.class_name}`,
          package: row.package || '',
          category: row.type,
          type: 'method',
          sourceUrl: row.source_url || '',
          rank: calculateRelevance(row.name + ' ' + (row.description || '') + ' ' + (row.signature || ''), terms)
        });
      }
    } catch (e) {
      console.error('[galachain-mcp] Member search error:', e);
    }
  }

  // Sort all results by relevance (lower rank = better match) and limit
  return results.sort((a, b) => a.rank - b.rank).slice(0, limit);
}

/**
 * Create a snippet from content, highlighting the first match
 */
function createSnippet(content: string, terms: string[], maxLen: number = 150): string {
  const lowerContent = content.toLowerCase();

  // Find the first term that matches
  let matchIndex = -1;
  for (const term of terms) {
    const idx = lowerContent.indexOf(term);
    if (idx !== -1 && (matchIndex === -1 || idx < matchIndex)) {
      matchIndex = idx;
    }
  }

  if (matchIndex === -1) {
    // No match found, return start of content
    return content.slice(0, maxLen) + (content.length > maxLen ? '...' : '');
  }

  // Create snippet around the match
  const start = Math.max(0, matchIndex - 40);
  const end = Math.min(content.length, matchIndex + maxLen - 40);
  let snippet = content.slice(start, end);

  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';

  return snippet;
}

/**
 * Calculate relevance score (lower = better match)
 */
function calculateRelevance(text: string, terms: string[]): number {
  const lowerText = text.toLowerCase();
  let score = 100;

  for (const term of terms) {
    // Exact word match (higher priority)
    const wordRegex = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');
    if (wordRegex.test(text)) {
      score -= 20;
    } else if (lowerText.includes(term)) {
      // Partial match
      score -= 10;
    }

    // Title/name match (even higher priority)
    const firstWord = text.split(/\s+/)[0]?.toLowerCase() || '';
    if (firstWord === term || firstWord.includes(term)) {
      score -= 30;
    }
  }

  // Prefer shorter texts (more focused)
  if (text.length < 100) score -= 5;
  if (text.length < 50) score -= 5;

  return Math.max(0, score);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getClass(name: string, pkg?: string): ClassWithMembers | null {
  const cls = get<ClassRow>(
    `
    SELECT * FROM classes
    WHERE name = ?
      AND (? IS NULL OR package = ?)
  `,
    [name, pkg || null, pkg || null]
  );

  if (!cls) return null;

  const members = all<MemberRow>(`SELECT * FROM members WHERE class_id = ?`, [cls.id]);

  return {
    id: cls.id,
    name: cls.name,
    package: cls.package,
    type: cls.type,
    description: cls.description || '',
    extendsClause: cls.extends_clause,
    implementsClause: safeJsonParse<string[]>(cls.implements_clause, []),
    decorators: safeJsonParse<string[]>(cls.decorators, []),
    sourceUrl: cls.source_url,
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      signature: m.signature || '',
      visibility: m.visibility || 'public',
      isStatic: !!m.is_static,
      isAsync: !!m.is_async,
      description: m.description || '',
      params: safeJsonParse<ParamInfo[]>(m.params, []),
      returns: m.returns ? safeJsonParse<{ type: string; description: string }>(m.returns, null) : null,
      decorators: safeJsonParse<string[]>(m.decorators, []),
      exampleCode: m.example_code
    }))
  };
}

export function getMethod(methodName: string, pkg?: string): MemberWithDetails[] {
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

  const results = all<MemberRow>(sql, [mName, className, className, pkg || null, pkg || null]);

  return results.map((m) => ({
    id: m.id,
    name: m.name,
    type: m.type,
    signature: m.signature || '',
    visibility: m.visibility || 'public',
    isStatic: !!m.is_static,
    isAsync: !!m.is_async,
    description: m.description || '',
    params: safeJsonParse<ParamInfo[]>(m.params, []),
    returns: m.returns ? safeJsonParse<{ type: string; description: string }>(m.returns, null) : null,
    decorators: safeJsonParse<string[]>(m.decorators, []),
    exampleCode: m.example_code,
    className: m.class_name,
    package: m.package,
    sourceUrl: m.source_url
  }));
}

export function listModules(
  pkg: string = 'all',
  type: string = 'all'
): Array<{ name: string; package: string; type: string; description: string }> {
  return all<{ name: string; package: string; type: string; description: string }>(
    `
    SELECT name, package, type, description
    FROM classes
    WHERE (? = 'all' OR package = ?)
      AND (? = 'all' OR type = ?)
    ORDER BY package, type, name
  `,
    [pkg, pkg, type, type]
  );
}

function safeJsonParse<T>(value: string | null | undefined, defaultValue: T): T {
  if (!value) return defaultValue;
  try {
    return JSON.parse(value) as T;
  } catch {
    return defaultValue;
  }
}
