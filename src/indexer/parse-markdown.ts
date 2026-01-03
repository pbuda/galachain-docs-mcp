import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import { toString } from 'mdast-util-to-string';
import type { Root, Heading, Code, List } from 'mdast';
import type { DocChunk } from '../types.js';

export function parseMarkdown(content: string, filePath: string): DocChunk[] {
  const tree = unified().use(remarkParse).parse(content) as Root;
  const chunks: DocChunk[] = [];

  const pkg = detectPackage(filePath);
  const category = detectCategory(filePath);
  const sourceUrl = filePathToUrl(filePath, pkg);

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
      currentContent.push(listToString(node as List));
    } else if (node.type === 'blockquote') {
      currentContent.push(`> ${toString(node)}`);
    }
  });

  saveChunk(); // Save last chunk
  return chunks;
}

function listToString(list: List): string {
  const items: string[] = [];
  for (const item of list.children) {
    const text = toString(item);
    items.push(`- ${text}`);
  }
  return items.join('\n');
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
  if (filePath.includes('README')) return 'reference';
  if (filePath.includes('CLAUDE')) return 'reference';
  if (filePath.includes('BREAKING')) return 'reference';
  return 'guide';
}

function filePathToUrl(filePath: string, pkg: string): string {
  // Convert local path to GitHub URL or docs URL
  const match = filePath.match(/galachain-sdk[\/\\](.+)$/);
  if (match) {
    const relativePath = match[1].replace(/\\/g, '/');
    return `https://github.com/GalaChain/sdk/blob/main/${relativePath}`;
  }
  return `https://docs.galachain.com/`;
}
