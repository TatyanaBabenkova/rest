import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const sourceDir = path.resolve('public/menu');
const names = (await fs.readdir(sourceDir)).filter((name) => name.endsWith('.png'));

for (const name of names) {
  const source = path.join(sourceDir, name);
  const target = path.join(sourceDir, name.replace(/\.png$/, '.webp'));
  await sharp(source)
    .resize(720, 720, { fit: 'cover' })
    .webp({ quality: 78, smartSubsample: true })
    .toFile(target);
}

console.log(`Optimized ${names.length} menu images.`);
