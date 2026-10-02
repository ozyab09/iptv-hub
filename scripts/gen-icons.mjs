/**
 * Генератор иконок IPTV Hub без внешних зависимостей.
 * Запуск: node scripts/gen-icons.mjs
 *
 * Рисует «ТВ-плитку»: белый экран со скруглением и play-знак внутри, на
 * акцентной заливке #ff4fa3 из токенов v2. Пиксель-арт из первой версии ушёл:
 * на плотностях Android 8×8-сетка выглядела как школьная поделка.
 *
 * Один и тот же вектор растеризуется в:
 *  - web: public/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-180,
 *    favicon-32}.png для манифеста, PWA и Safari;
 *  - Android: adaptive icon (mipmap-anydpi-v26 + foreground/background/
 *    monochrome по всем плотностям) и splash Android 12+.
 *
 * PNG собирается вручную: сигнатура → IHDR → IDAT (zlib deflateSync) → IEND,
 * CRC32 таблично. Сглаживание — супер-сэмплинг ×4 без альфа-канала
 * (цвета смешиваются в sRGB, как это делал бы браузер).
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const webOut = join(root, "public", "icons");
const resDir = join(root, "android", "app", "src", "main", "res");

/** Токен --accent из дизайн-системы v2 (один акцент, без градиентов). */
const ACCENT = [255, 79, 163];
const WHITE = [255, 255, 255];
const TRANSPARENT = null;

// ---------- CRC32 / PNG ----------
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/**
 * Собирает RGBA-растр из функции цвета. `pixel(x, y)` получает координаты в
 * диапазоне [0, 1) и возвращает [r, g, b, a] либо TRANSPARENT.
 */
function raster(size, pixel) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  let off = 0;
  for (let y = 0; y < size; y++) {
    raw[off++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const c = pixel((x + 0.5) / size, (y + 0.5) / size);
      if (!c) {
        raw[off++] = 0;
        raw[off++] = 0;
        raw[off++] = 0;
        raw[off++] = 0;
      } else {
        raw[off++] = c[0];
        raw[off++] = c[1];
        raw[off++] = c[2];
        raw[off++] = c[3] ?? 255;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: truecolor + alpha
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Растеризация со сглаживанием: 4×4 отсчёта на пиксель. */
function render(size, pixel, samples = 4) {
  return raster(size, (u, v) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < samples; sy++) {
      for (let sx = 0; sx < samples; sx++) {
        const c = pixel(u + (sx + 0.5) / (samples * size), v + (sy + 0.5) / (samples * size));
        if (c) {
          r += c[0];
          g += c[1];
          b += c[2];
          a += c[3] ?? 255;
        }
      }
    }
    const total = samples * samples;
    if (a === 0) return null;
    const cover = a / (total * 255);
    return [Math.round(r / total / cover), Math.round(g / total / cover), Math.round(b / total / cover), Math.round(a / total)];
  });
}

// ---------- Геометрия знака ----------
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
/** Близость к прямоугольнику со скруглением: 1 внутри, 0 снаружи. */
function roundedRect(u, v, x0, y0, x1, y1, radius) {
  if (u < x0 || u > x1 || v < y0 || v > y1) return 0;
  const cx = Math.min(Math.max(u, x0 + radius), x1 - radius);
  const cy = Math.min(Math.max(v, y0 + radius), y1 - radius);
  const d = Math.hypot(u - cx, v - cy);
  return d <= radius ? 1 : d <= radius + 0.004 ? 1 - (d - radius) / 0.004 : 0;
}
/** Знак «play» как пересечение двух полуплоскостей и вертикали. */
function playSign(u, v, x0, x1, cy, half, smooth = 0.004) {
  if (u < x0 || u > x1) return 0;
  const t = (u - x0) / (x1 - x0);
  const reach = half * (1 - t);
  const inside = Math.abs(v - cy) <= reach;
  const edge = Math.abs(Math.abs(v - cy) - reach);
  if (inside) return 1;
  return edge <= smooth ? 1 - edge / smooth : 0;
}
function mix(base, top, alpha) {
  if (alpha >= 1) return top;
  if (alpha <= 0) return base;
  return [
    Math.round(base[0] + (top[0] - base[0]) * alpha),
    Math.round(base[1] + (top[1] - base[1]) * alpha),
    Math.round(base[2] + (top[2] - base[2]) * alpha),
    255,
  ];
}

/**
 * Знак приложения. `scale` — доля холста, занятая экраном (для adaptive
 * foreground берём 0.60, чтобы знак целиком лежал в safe zone 66/108 dp).
 * `background` — заливка холста или null (прозрачный фон для foreground).
 * `mono` — рисовать знак белым по прозрачному (themed icons Android 13+).
 */
function appMark({ scale = 0.62, background = ACCENT, mono = false } = {}) {
  const screen = { x0: 0.5 - scale / 2, x1: 0.5 + scale / 2, y0: 0.5 - scale * 0.32, y1: 0.5 + scale * 0.32, r: scale * 0.10 };
  // Треугольник оптически центрируется не по геометрии, а по барицентру:
  // сдвигаем его влево, иначе знак «уезжает» вправо внутри экрана.
  const sign = { x0: 0.5 - scale * 0.13, x1: 0.5 + scale * 0.15, cy: 0.5, half: scale * 0.16 };
  return (u, v) => {
    const base = background ?? TRANSPARENT;
    const screenCover = roundedRect(u, v, screen.x0, screen.y0, screen.x1, screen.y1, screen.r);
    const signCover = playSign(u, v, sign.x0, sign.x1, sign.cy, sign.half);
    if (mono) {
      const cover = Math.max(screenCover, signCover);
      return cover > 0 ? [WHITE[0], WHITE[1], WHITE[2], Math.round(cover * 255)] : null;
    }
    // Экран белый, play-знак — «вырез» акцентного цвета внутри экрана.
    const cover = clamp01(screenCover);
    if (cover <= 0) return base;
    const ink = mix(WHITE, ACCENT, Math.max(0, Math.min(1, signCover)) * cover);
    return base ? mix(base, ink, cover) : [ink[0], ink[1], ink[2], Math.round(cover * 255)];
  };
}

// ---------- Web-иконки ----------
mkdirSync(webOut, { recursive: true });
const files = [
  ["icon-192.png", 192, appMark()],
  ["icon-512.png", 512, appMark()],
  // maskable: знак ужат, чтобы пережить круглую/скруглённую маску лаунчера.
  ["icon-maskable-512.png", 512, appMark({ scale: 0.44 })],
  ["apple-touch-180.png", 180, appMark({ scale: 0.68 })],
  ["favicon-32.png", 32, appMark({ scale: 0.66 })],
];
for (const [name, size, pixel] of files) writeFileSync(join(webOut, name), render(size, pixel));
console.log(`✅ Web-иконки: ${files.map(([n]) => n).join(", ")}`);

// ---------- Android: adaptive icon + splash ----------
// Плотности и размеры слоя adaptive icon: 108 dp холста.
const densities = [
  ["mdpi", 108],
  ["hdpi", 162],
  ["xhdpi", 216],
  ["xxhdpi", 324],
  ["xxxhdpi", 432],
];
for (const [density, size] of densities) {
  const dir = join(resDir, `mipmap-${density}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "ic_launcher_foreground.png"), render(size, appMark({ scale: 0.50, background: null })));
  writeFileSync(join(dir, "ic_launcher_monochrome.png"), render(size, appMark({ scale: 0.50, background: null, mono: true })));
}
// Старые лаунчеры (до Android 8) берут готовую квадратную иконку.
for (const [density, size] of [["mdpi", 48], ["hdpi", 72], ["xhdpi", 96], ["xxhdpi", 144], ["xxxhdpi", 192]]) {
  writeFileSync(join(resDir, `mipmap-${density}`, "ic_launcher.png"), render(size, appMark({ scale: 0.78 })));
}
// Splash Android 12+: знак крупнее, потому что маски лаунчера здесь нет.
for (const [density, size] of densities) {
  writeFileSync(join(resDir, `mipmap-${density}`, "ic_splash.png"), render(size, appMark({ scale: 0.68 })));
}
mkdirSync(join(resDir, "mipmap-anydpi-v26"), { recursive: true });
writeFileSync(
  join(resDir, "mipmap-anydpi-v26", "ic_launcher.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<!-- Adaptive icon (Android 8+): фон и знак — отдельные слои, лаунчер
     сам применяет маску и параллакс. monochrome используется themed icons
     Android 13+ (Material You). -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
`,
);
mkdirSync(join(resDir, "values"), { recursive: true });
writeFileSync(
  join(resDir, "values", "colors.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Тот же акцент, что в public/icons и токен accent дизайн-системы v2. -->
    <color name="ic_launcher_background">#FF4FA3</color>
    <color name="splash_background">#0C0D10</color>
</resources>
`,
);
console.log(`✅ Android: adaptive icon (${densities.length} плотностей) + monochrome + legacy ic_launcher`);
