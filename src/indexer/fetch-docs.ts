import { simpleGit } from 'simple-git';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_URL = 'https://github.com/GalaChain/sdk.git';
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const REPO_DIR = path.join(DATA_DIR, 'repos', 'galachain-sdk');

export async function fetchDocs(): Promise<string> {
  const git = simpleGit();

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(REPO_DIR)) {
    // Pull latest
    console.error('[galachain-mcp] Updating existing repo...');
    try {
      await git.cwd(REPO_DIR).pull();
    } catch (error) {
      // If pull fails, try to continue with existing files
      console.error('[galachain-mcp] Pull failed, using existing files:', error);
    }
  } else {
    // Clone fresh (shallow)
    console.error('[galachain-mcp] Cloning GalaChain SDK...');
    const parentDir = path.dirname(REPO_DIR);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    await git.clone(REPO_URL, REPO_DIR, ['--depth', '1']);
  }

  return REPO_DIR;
}

export function getDocsFiles(repoDir: string): string[] {
  const files: string[] = [];

  // Guide markdown files in docs/
  const docsDir = path.join(repoDir, 'docs');
  if (fs.existsSync(docsDir)) {
    const entries = fs.readdirSync(docsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(path.join(docsDir, entry.name));
      }
      // TypeDoc directories (*-docs/)
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

  // Additional docs at root level
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

export function getRepoDir(): string {
  return REPO_DIR;
}
