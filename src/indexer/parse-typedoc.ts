import type { ClassInfo, MemberInfo, ParamInfo } from '../types.js';

export function parseTypedocMarkdown(content: string, filePath: string): ClassInfo[] {
  const classes: ClassInfo[] = [];
  const pkg = detectPackageFromPath(filePath);
  const sourceUrl = getSourceUrl(filePath, pkg);

  // TypeDoc exports.md structure varies, try multiple patterns
  // Pattern 1: ## ClassName sections
  const classSections = content.split(/^## (?!Classes|Interfaces|Type Aliases|Enumerations|Functions)/m);

  for (const section of classSections.slice(1)) {
    const lines = section.split('\n');
    const firstLine = lines[0]?.trim();

    if (!firstLine || firstLine.startsWith('#')) continue;

    // Extract class/interface name (handle markdown links like [ClassName](url))
    const nameMatch = firstLine.match(/^\[?(\w+)\]?/);
    if (!nameMatch) continue;

    const className = nameMatch[1];
    const classInfo = parseClassSection(className, section, pkg, filePath, sourceUrl);
    if (classInfo) {
      classes.push(classInfo);
    }
  }

  // Pattern 2: ### ClassName sections (nested under ## Classes, etc.)
  const nestedSections = content.split(/^### (?!\s)/m);
  for (const section of nestedSections.slice(1)) {
    const lines = section.split('\n');
    const firstLine = lines[0]?.trim();

    if (!firstLine) continue;

    // Extract class/interface name
    const nameMatch = firstLine.match(/^\[?(\w+)\]?/);
    if (!nameMatch) continue;

    const className = nameMatch[1];

    // Skip if already parsed
    if (classes.some((c) => c.name === className)) continue;

    const classInfo = parseClassSection(className, section, pkg, filePath, sourceUrl);
    if (classInfo) {
      classes.push(classInfo);
    }
  }

  return classes;
}

function parseClassSection(
  name: string,
  section: string,
  pkg: string,
  filePath: string,
  sourceUrl: string
): ClassInfo | null {
  // Skip common section headers that aren't actual classes
  const skipNames = [
    'Classes',
    'Interfaces',
    'Type',
    'Enumerations',
    'Functions',
    'Variables',
    'References',
    'Exports'
  ];
  if (skipNames.includes(name)) return null;

  const lines = section.split('\n');

  // Extract description (text after name, before first heading or code block)
  const descLines: string[] = [];
  let i = 1;
  while (i < lines.length && !lines[i].startsWith('#') && !lines[i].startsWith('```')) {
    const line = lines[i].trim();
    if (line && !line.startsWith('|') && !line.startsWith('-')) {
      descLines.push(line);
    }
    i++;
  }

  // Detect type from section content
  let type: ClassInfo['type'] = 'class';
  if (section.toLowerCase().includes('interface') || name.startsWith('I')) {
    type = 'interface';
  } else if (section.toLowerCase().includes('type alias')) {
    type = 'type';
  } else if (section.toLowerCase().includes('enumeration') || name.endsWith('Enum')) {
    type = 'enum';
  } else if (section.toLowerCase().includes('function')) {
    type = 'function';
  }

  // Extract extends clause
  const extendsMatch = section.match(/(?:Extends|extends)[:\s]+[`\[]?(\w+)[`\]]?/i);
  const extendsClause = extendsMatch ? extendsMatch[1] : null;

  // Extract implements
  const implementsMatch = section.match(/(?:Implements|implements)[:\s]+(.+)/i);
  const implementsClause = implementsMatch
    ? implementsMatch[1]
        .split(',')
        .map((s) => s.trim().replace(/[`\[\]]/g, ''))
        .filter((s) => s.length > 0)
    : [];

  // Parse members
  const members = parseMembers(section);

  return {
    name,
    package: pkg,
    type,
    description: cleanDescription(descLines.join(' ')),
    extendsClause,
    implementsClause,
    decorators: extractDecorators(section),
    members,
    filePath,
    sourceUrl
  };
}

function parseMembers(section: string): MemberInfo[] {
  const members: MemberInfo[] = [];

  // Look for method/property patterns
  // Pattern: #### methodName or ##### methodName
  const memberPattern = /^#{4,5}\s+(\w+)/gm;
  let match;

  while ((match = memberPattern.exec(section)) !== null) {
    const memberName = match[1];

    // Skip section headers
    if (
      ['Constructor', 'Methods', 'Properties', 'Accessors', 'Parameters', 'Returns'].includes(memberName)
    ) {
      continue;
    }

    const startIndex = match.index;
    const afterMatch = section.slice(startIndex);
    const nextHeadingMatch = afterMatch.slice(match[0].length).search(/^#{1,5}\s/m);
    const memberSection =
      nextHeadingMatch > 0 ? afterMatch.slice(0, match[0].length + nextHeadingMatch) : afterMatch;

    const member = parseMemberSection(memberName, memberSection);
    if (member) {
      members.push(member);
    }
  }

  // Also look for code block signatures that might indicate methods
  const sigPattern = /```(?:typescript|ts)?\s*\n((?:(?:public|private|protected|static|async)\s+)*\w+\s*\([^)]*\)[^`]*)\n```/g;
  while ((match = sigPattern.exec(section)) !== null) {
    const signature = match[1].trim();
    const nameMatch = signature.match(/(\w+)\s*\(/);
    if (nameMatch && !members.some((m) => m.name === nameMatch[1])) {
      const member = parseMemberFromSignature(signature, section.slice(match.index));
      if (member) {
        members.push(member);
      }
    }
  }

  return members;
}

function parseMemberSection(name: string, section: string): MemberInfo | null {
  // Extract signature from code block
  const sigMatch = section.match(/```(?:typescript|ts)?\s*\n([^`]+)\n```/);
  const signature = sigMatch ? sigMatch[1].trim().split('\n')[0] : '';

  // Detect member type
  let type: MemberInfo['type'] = 'method';
  if (name === 'constructor' || name === 'new') {
    type = 'constructor';
  } else if (!signature.includes('(') && !section.toLowerCase().includes('method')) {
    type = 'property';
  } else if (section.includes('get ') || section.includes('set ')) {
    type = 'accessor';
  }

  // Extract description - look for text after the heading
  let description = '';
  const descMatch = section.match(/#{4,5}\s+\w+\s*\n+([^#`\n][^\n]+)/);
  if (descMatch) {
    description = cleanDescription(descMatch[1]);
  }

  // Detect visibility
  let visibility: MemberInfo['visibility'] = 'public';
  if (signature.includes('protected ') || section.includes('protected')) {
    visibility = 'protected';
  } else if (signature.includes('private ') || section.includes('private')) {
    visibility = 'private';
  }

  // Parse parameters
  const params = parseParams(section, signature);

  // Parse returns
  const returnsMatch = section.match(/(?:Returns?|return type)[:\s]+[`\[]?([^`\]\n]+)[`\]]?(?:\s*[-–]\s*(.+))?/i);
  const returns = returnsMatch ? { type: returnsMatch[1].trim(), description: returnsMatch[2] || '' } : null;

  return {
    name,
    type,
    signature,
    visibility,
    isStatic: signature.includes('static ') || section.includes('static'),
    isAsync: signature.includes('async ') || signature.includes('Promise<'),
    description,
    params,
    returns,
    decorators: extractDecorators(section),
    exampleCode: extractCodeExample(section)
  };
}

function parseMemberFromSignature(signature: string, context: string): MemberInfo | null {
  const nameMatch = signature.match(/(\w+)\s*\(/);
  if (!nameMatch) return null;

  const name = nameMatch[1];
  const params = parseParams(context, signature);

  const returnMatch = signature.match(/\):\s*(.+?)(?:\s*\{|$)/);
  const returns = returnMatch ? { type: returnMatch[1].trim(), description: '' } : null;

  return {
    name,
    type: name === 'constructor' ? 'constructor' : 'method',
    signature,
    visibility: 'public',
    isStatic: signature.includes('static '),
    isAsync: signature.includes('async ') || signature.includes('Promise<'),
    description: '',
    params,
    returns,
    decorators: extractDecorators(context),
    exampleCode: null
  };
}

function parseParams(section: string, signature: string): ParamInfo[] {
  const params: ParamInfo[] = [];

  // Try to extract from signature first
  const sigParamsMatch = signature.match(/\(([^)]*)\)/);
  if (sigParamsMatch && sigParamsMatch[1].trim()) {
    const paramStr = sigParamsMatch[1];
    // Split by comma, but not within angle brackets or parentheses
    const paramParts = splitParams(paramStr);

    for (const part of paramParts) {
      const paramMatch = part.match(/(\w+)(\?)?:\s*(.+)/);
      if (paramMatch) {
        params.push({
          name: paramMatch[1],
          type: paramMatch[3].trim(),
          description: '',
          optional: !!paramMatch[2]
        });
      }
    }
  }

  // Try to enrich with descriptions from markdown
  const paramDescPattern = /[•\-\*]\s*[`']?(\w+)[`']?(?:\s*\(([^)]+)\))?(?:\s*[-–:]\s*(.+))?/g;
  let match;
  while ((match = paramDescPattern.exec(section)) !== null) {
    const paramName = match[1];
    const existing = params.find((p) => p.name === paramName);
    if (existing) {
      if (match[2]) existing.type = match[2];
      if (match[3]) existing.description = match[3].trim();
    } else if (match[2] || match[3]) {
      params.push({
        name: paramName,
        type: match[2] || 'unknown',
        description: match[3]?.trim() || '',
        optional: match[0].includes('optional') || match[0].includes('?')
      });
    }
  }

  return params;
}

function splitParams(paramStr: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of paramStr) {
    if (char === '<' || char === '(' || char === '{' || char === '[') {
      depth++;
    } else if (char === '>' || char === ')' || char === '}' || char === ']') {
      depth--;
    } else if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
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
  const exampleMatch = section.match(/[Ee]xample[s]?[:\s]*\n```(?:typescript|ts|javascript|js)?\s*\n([^`]+)\n```/);
  return exampleMatch ? exampleMatch[1].trim() : null;
}

function cleanDescription(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove markdown links, keep text
    .replace(/`([^`]+)`/g, '$1') // Remove inline code formatting
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
    .replace(/\*([^*]+)\*/g, '$1') // Remove italic
    .trim();
}

function detectPackageFromPath(filePath: string): string {
  if (filePath.includes('chain-api-docs')) return 'chain-api';
  if (filePath.includes('chain-client-docs')) return 'chain-client';
  if (filePath.includes('chain-test-docs')) return 'chain-test';
  if (filePath.includes('chaincode-docs')) return 'chaincode';
  return 'unknown';
}

function getSourceUrl(filePath: string, pkg: string): string {
  const match = filePath.match(/galachain-sdk[\/\\](.+)$/);
  if (match) {
    const relativePath = match[1].replace(/\\/g, '/');
    return `https://github.com/GalaChain/sdk/blob/main/${relativePath}`;
  }
  return `https://docs.galachain.com/latest/${pkg}-docs/`;
}
