import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const ignoredDirs = new Set(['.git', 'node_modules', 'dist', 'build']);
const riskyPatterns = [
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /BASE44_[A-Z_]*SECRET[ \t]*=[ \t]*[^\s#]+/,
  /GITHUB_TOKEN[ \t]*=[ \t]*[^\s#]+/,
];

function walk(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    if (ignoredDirs.has(entry)) continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) files.push(...walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

const violations = [];
for (const file of walk(root)) {
  if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')) continue;
  const content = readFileSync(file, 'utf8');
  for (const pattern of riskyPatterns) {
    if (pattern.test(content)) violations.push(file);
  }
}

if (violations.length) {
  console.error('Potential secret values found in:');
  for (const file of [...new Set(violations)]) console.error(`- ${file}`);
  process.exit(1);
}

console.log('No obvious committed secrets detected.');
