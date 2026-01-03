import { getMethod } from '../db/queries.js';
import { getIndexStatus } from '../index.js';

interface GetMethodArgs {
  method_name: string;
  package?: string;
}

export async function getGalachainMethod(args: GetMethodArgs) {
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

  const { method_name: methodName, package: pkg } = args;

  if (!methodName || methodName.trim().length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'Please provide a method name (e.g., "submit" or "GalaContract.submit").'
        }
      ]
    };
  }

  const results = getMethod(methodName, pkg);

  if (results.length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Method "${methodName}" not found${pkg ? ` in package ${pkg}` : ''}.`
        }
      ]
    };
  }

  const formatted = results.map((m) => {
    const lines: string[] = [];

    lines.push(`# ${m.className}.${m.name}`);
    lines.push('');
    lines.push(`**Package:** ${m.package}`);
    lines.push(`**Class:** ${m.className}`);

    const modifiers: string[] = [];
    if (m.isStatic) modifiers.push('static');
    if (m.isAsync) modifiers.push('async');
    if (m.visibility !== 'public') modifiers.push(m.visibility);

    if (modifiers.length > 0) {
      lines.push(`**Modifiers:** ${modifiers.join(', ')}`);
    }

    if (m.decorators.length > 0) {
      lines.push(`**Decorators:** ${m.decorators.map((d) => `@${d}`).join(', ')}`);
    }

    if (m.signature) {
      lines.push('', '## Signature', '```typescript', m.signature, '```');
    }

    if (m.description) {
      lines.push('', '## Description', '', m.description);
    }

    if (m.params.length > 0) {
      lines.push('', '## Parameters');
      for (const p of m.params) {
        const optStr = p.optional ? '?' : '';
        lines.push(`- \`${p.name}${optStr}\` (${p.type})${p.description ? ': ' + p.description : ''}`);
      }
    }

    if (m.returns) {
      lines.push(
        '',
        '## Returns',
        `\`${m.returns.type}\`${m.returns.description ? ' - ' + m.returns.description : ''}`
      );
    }

    if (m.exampleCode) {
      lines.push('', '## Example', '```typescript', m.exampleCode, '```');
    }

    lines.push('', `**Source:** ${m.sourceUrl}`);

    return lines.join('\n');
  });

  const header =
    results.length > 1 ? `Found ${results.length} methods matching "${methodName}":\n\n---\n\n` : '';

  return {
    content: [
      {
        type: 'text' as const,
        text: header + formatted.join('\n\n---\n\n')
      }
    ]
  };
}
