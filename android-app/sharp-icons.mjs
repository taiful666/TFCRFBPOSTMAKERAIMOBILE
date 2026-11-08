// Re-render the adaptive launcher icon layers at full Android resolution (108dp per density),
// replacing the low-resolution copies the icon generator writes.
import sharp from 'sharp';
import fs from 'node:fs';
const res = 'android/app/src/main/res';
const sizes = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
for (const [d, px] of Object.entries(sizes)) {
  const dir = `${res}/mipmap-${d}`;
  fs.mkdirSync(dir, { recursive: true });
  for (const [src, name] of [['assets/icon-foreground.png', 'ic_launcher_foreground.png'], ['assets/icon-background.png', 'ic_launcher_background.png']]) {
    await sharp(src).resize(px, px, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(`${dir}/${name}`);
  }
  console.log(`mipmap-${d}: ${px}px`);
}
