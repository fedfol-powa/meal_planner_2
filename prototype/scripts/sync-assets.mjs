// Copies the approved fonts and recipe photos from design/ so they are not duplicated in Git.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const design = resolve(root, '../design/assets');
const target = resolve(root, 'static/assets');

mkdirSync(target, { recursive: true });
cpSync(resolve(design, 'hellofresh/fonts'), resolve(target, 'fonts'), { recursive: true });
cpSync(resolve(design, 'recipe-images'), resolve(target, 'recipe-images'), { recursive: true });
console.log('Assets synced to static/assets');
