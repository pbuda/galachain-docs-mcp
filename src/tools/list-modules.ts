import { listModules } from '../db/queries.js';
import { getIndexStatus } from '../index.js';

interface ListModulesArgs {
  package?: string;
  type?: string;
}

export async function listGalachainModules(args: ListModulesArgs) {
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

  const { package: pkg = 'all', type = 'all' } = args;

  const results = listModules(pkg, type);

  if (results.length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `No modules found${pkg !== 'all' ? ` in package ${pkg}` : ''}${type !== 'all' ? ` of type ${type}` : ''}.`
        }
      ]
    };
  }

  // Group by package
  const byPackage = new Map<string, typeof results>();
  for (const item of results) {
    const pkgItems = byPackage.get(item.package) || [];
    pkgItems.push(item);
    byPackage.set(item.package, pkgItems);
  }

  const lines: string[] = [
    `# GalaChain SDK Modules`,
    '',
    `Found ${results.length} module(s)${pkg !== 'all' ? ` in package ${pkg}` : ''}${type !== 'all' ? ` of type ${type}` : ''}.`,
    ''
  ];

  for (const [pkgName, items] of byPackage) {
    lines.push(`## @gala-chain/${pkgName}`);
    lines.push('');

    // Group by type within package
    const byType = new Map<string, typeof items>();
    for (const item of items) {
      const typeItems = byType.get(item.type) || [];
      typeItems.push(item);
      byType.set(item.type, typeItems);
    }

    for (const [typeName, typeItems] of byType) {
      lines.push(`### ${capitalize(typeName)}s`);
      lines.push('');

      for (const item of typeItems) {
        const desc = item.description ? ` - ${truncate(item.description, 80)}` : '';
        lines.push(`- **${item.name}**${desc}`);
      }

      lines.push('');
    }
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: lines.join('\n')
      }
    ]
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 3) + '...';
}
