// Copies the approved fonts and the recipe photos of the fake mode from design/, so they are not duplicated in Git.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { skillZip } from './skill-zip.mjs';

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
// The Claude skill offered on «Collega un agente» (W17), outside /assets/ so the service worker never keeps an old one.
const downloads = resolve(root, 'public/downloads');
mkdirSync(downloads, { recursive: true });
writeFileSync(resolve(downloads, 'cosa-si-mangia.zip'), skillZip(resolve(root, '../agent-skill/cosa-si-mangia')));
console.log('Assets synced to public/assets, skill zipped to public/downloads');
