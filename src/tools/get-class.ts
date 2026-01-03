import { getClass } from '../db/queries.js';
import { getIndexStatus } from '../index.js';

interface GetClassArgs {
  name: string;
  package?: string;
}

export async function getGalachainClass(args: GetClassArgs) {
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

  const { name, package: pkg } = args;

  if (!name || name.trim().length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'Please provide a class/interface name.'
        }
      ]
    };
  }

  const cls = getClass(name, pkg);

  if (!cls) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Class/interface "${name}" not found${pkg ? ` in package ${pkg}` : ''}.`
        }
      ]
    };
  }

  const lines: string[] = [
    `# ${cls.name}`,
    ``,
    `**Package:** ${cls.package}`,
    `**Type:** ${cls.type}`
  ];

  if (cls.extendsClause) {
    lines.push(`**Extends:** ${cls.extendsClause}`);
  }

  if (cls.implementsClause.length > 0) {
    lines.push(`**Implements:** ${cls.implementsClause.join(', ')}`);
  }

  if (cls.decorators.length > 0) {
    lines.push(`**Decorators:** ${cls.decorators.map((d) => `@${d}`).join(', ')}`);
  }

  if (cls.description) {
    lines.push('', '## Description', '', cls.description);
  }

  if (cls.members.length > 0) {
    // Group members by type
    const constructors = cls.members.filter((m) => m.type === 'constructor');
    const methods = cls.members.filter((m) => m.type === 'method');
    const properties = cls.members.filter((m) => m.type === 'property');
    const accessors = cls.members.filter((m) => m.type === 'accessor');

    if (constructors.length > 0) {
      lines.push('', '## Constructor');
      for (const m of constructors) {
        lines.push('', formatMember(m));
      }
    }

    if (properties.length > 0) {
      lines.push('', '## Properties');
      for (const m of properties) {
        lines.push('', formatMember(m));
      }
    }

    if (accessors.length > 0) {
      lines.push('', '## Accessors');
      for (const m of accessors) {
        lines.push('', formatMember(m));
      }
    }

    if (methods.length > 0) {
      lines.push('', '## Methods');
      for (const m of methods) {
        lines.push('', formatMember(m));
      }
    }
  }

  lines.push('', `**Source:** ${cls.sourceUrl}`);

  return {
    content: [
      {
        type: 'text' as const,
        text: lines.join('\n')
      }
    ]
  };
}

function formatMember(m: {
  name: string;
  type: string;
  signature: string;
  visibility: string;
  isStatic: boolean;
  isAsync: boolean;
  description: string;
  params: Array<{ name: string; type: string; description: string; optional: boolean }>;
  returns: { type: string; description: string } | null;
  decorators: string[];
  exampleCode: string | null;
}): string {
  const lines: string[] = [];

  const modifiers: string[] = [];
  if (m.isStatic) modifiers.push('static');
  if (m.isAsync) modifiers.push('async');
  if (m.visibility !== 'public') modifiers.push(m.visibility);

  const decoratorStr = m.decorators.length > 0 ? m.decorators.map((d) => `@${d}`).join(' ') + ' ' : '';
  const modifierStr = modifiers.length > 0 ? modifiers.join(' ') + ' ' : '';

  lines.push(`### ${decoratorStr}${modifierStr}${m.name}`);

  if (m.signature) {
    lines.push('```typescript', m.signature, '```');
  }

  if (m.description) {
    lines.push('', m.description);
  }

  if (m.params.length > 0) {
    lines.push('', '**Parameters:**');
    for (const p of m.params) {
      const optStr = p.optional ? '?' : '';
      lines.push(`- \`${p.name}${optStr}\` (${p.type})${p.description ? ': ' + p.description : ''}`);
    }
  }

  if (m.returns) {
    lines.push('', `**Returns:** \`${m.returns.type}\`${m.returns.description ? ' - ' + m.returns.description : ''}`);
  }

  if (m.exampleCode) {
    lines.push('', '**Example:**', '```typescript', m.exampleCode, '```');
  }

  return lines.join('\n');
}
