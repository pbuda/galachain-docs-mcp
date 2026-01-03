import { searchDocs } from '../db/queries.js';
import { getIndexStatus } from '../index.js';

interface SearchArgs {
  query: string;
  package?: string;
  type?: string;
  limit?: number;
}

export async function searchGalachainDocs(args: SearchArgs) {
  const status = getIndexStatus();

  if (status.status === 'building') {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'Index is building (~60s on first run). Please wait and try again.'
        }
      ]
    };
  }

  if (status.status === 'error') {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Index build failed: ${status.error}. Try running with --rebuild flag.`
        }
      ]
    };
  }

  const { query, package: pkg = 'all', type = 'all', limit = 5 } = args;

  if (!query || query.trim().length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'Please provide a search query.'
        }
      ]
    };
  }

  const results = searchDocs(query, pkg, type, Math.min(Math.max(limit, 1), 20));

  if (results.length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `No results found for "${query}"${pkg !== 'all' ? ` in package ${pkg}` : ''}${type !== 'all' ? ` of type ${type}` : ''}.`
        }
      ]
    };
  }

  const formatted = results.map((r, i) => {
    const lines = [
      `**${i + 1}. ${r.title}**`,
      `   Package: ${r.package} | Type: ${r.type}`,
      `   ${r.snippet}`,
      `   Source: ${r.sourceUrl}`
    ];
    return lines.join('\n');
  });

  return {
    content: [
      {
        type: 'text' as const,
        text: `Found ${results.length} result(s) for "${query}":\n\n${formatted.join('\n\n')}`
      }
    ]
  };
}
