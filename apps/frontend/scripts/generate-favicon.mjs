/**
 * Build favicon assets from the sidebar brand mark (trim padding, scale up for tab visibility).
 * Run: node scripts/generate-favicon.mjs
 */
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const mini = path.join(root, 'public/brand/querlio-mini.png');
const logo = path.join(root, 'public/brand/querlio-logo.png');

/** Prefer mini (sidebar collapsed icon); fallback crop from wordmark left mark. */
async function loadSource() {
  try {
    const trimmed = await sharp(mini).trim().toBuffer();
    const meta = await sharp(trimmed).metadata();
    if ((meta.width ?? 0) > 32) return trimmed;
  } catch {
    /* use logo crop */
  }
  return sharp(logo)
    .extract({ left: 0, top: 0, width: 305, height: 305 })
    .png()
    .toBuffer();
}

async function writeIcon(outPath, size) {
  const src = await loadSource();
  const inner = Math.round(size * 0.9);
  const pad = Math.floor((size - inner) / 2);
  await sharp(src)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({
      top: pad,
      bottom: size - inner - pad,
      left: pad,
      right: size - inner - pad,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(outPath);
}

const appDir = path.join(root, 'src/app');
const publicFavicon = path.join(root, 'public/favicon.png');

await writeIcon(path.join(appDir, 'icon.png'), 512);
await writeIcon(path.join(appDir, 'apple-icon.png'), 180);
await writeIcon(publicFavicon, 192);
await sharp(path.join(appDir, 'icon.png'))
  .resize(32, 32)
  .toFile(path.join(root, 'public/favicon-32x32.png'));

console.log('Favicon assets written: src/app/icon.png, apple-icon.png, public/favicon.png');
