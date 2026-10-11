// Copies the approved fonts from design/ so they are not duplicated in Git (recipes have no photos).
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const design = resolve(root, '../design/assets');
const target = resolve(root, 'public/assets');

mkdirSync(target, { recursive: true });
cpSync(resolve(design, 'hellofresh/fonts'), resolve(target, 'fonts'), { recursive: true });
console.log('Assets synced to public/assets');
