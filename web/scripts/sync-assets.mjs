// Copies the approved fonts and the recipe photos of the fake mode from design/, so they are not duplicated in Git.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const design = resolve(root, '../design/assets');
const target = resolve(root, 'public/assets');

mkdirSync(target, { recursive: true });
cpSync(resolve(design, 'hellofresh/fonts'), resolve(target, 'fonts'), { recursive: true });
// Photos of the demo recipes, named by recipe id, for the fake mode of the dev server only: real
// photos come from /photos/, and the build never ships them.
const demoPhotos = resolve(target, 'recipe-images');
if (process.argv.includes('--demo-photos')) cpSync(resolve(design, 'recipe-images'), demoPhotos, { recursive: true });
else rmSync(demoPhotos, { recursive: true, force: true });
console.log('Assets synced to public/assets');
