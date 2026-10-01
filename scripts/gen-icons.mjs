/**
 * Генератор PNG-иконок для PWA без внешних зависимостей.
 * Запуск: node scripts/gen-icons.mjs  (результат — в public/icons/)
 *
 * Рисует плитку: ровная акцентная заливка (#ff4fa3 из токенов v2) и белый
 * пиксель-арт «телевизор». Градиент розовый→синий из v1 ушёл: дизайн-система
 * держит один акцент и не использует градиенты как фирменный приём.
 * PNG собирается вручную:
 * сигнатура → IHDR → IDAT (zlib, нативный deflateSync) → IEND, CRC32 таблично.
 * Шрифтов в Node нет, поэтому глиф — явная битмап-сетка 8×8.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");
mkdirSync(outDir, { recursive: true });

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** Пиксель-арт «телевизор» 8×8: "x,y" (колонка, строка). */
const GLYPH = new Set([
  "2,0", "3,1", // левое «ухо» антенны
  "5,0", "4,1", // правое «ухо»
  ...range(1, 6).map((c) => `${c},2`), // верхняя грань
  ...range(3, 5).map((r) => `1,${r}`), // левая грань
  ...range(3, 5).map((r) => `6,${r}`), // правая грань
  ...range(1, 6).map((c) => `${c},6`), // нижняя грань
]);

// ---------- CRC32 ----------
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

// ---------- PNG ----------
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function png(size) {
  const raw = Buffer.alloc(size * (1 + size * 3));
  let off = 0;
  for (let y = 0; y < size; y++) {
    raw[off++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      // Плоский акцент --accent: #ff4fa3
      let r = 255;
      let g = 79;
      let b = 163;
      const gx = Math.floor((x / size) * 8);
      const gy = Math.floor((y / size) * 8);
      if (GLYPH.has(`${gx},${gy}`)) {
        r = g = b = 255;
      }
      raw[off++] = r;
      raw[off++] = g;
      raw[off++] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// 512-иконка маскируемая (safe zone — центральные 80%; глиф уже отцентрован)
const big = png(512);
writeFileSync(join(outDir, "icon-192.png"), png(192));
writeFileSync(join(outDir, "icon-512.png"), big);
writeFileSync(join(outDir, "icon-maskable-512.png"), big);
console.log("✅ Иконки сгенерированы: public/icons/{icon-192,icon-512,icon-maskable-512}.png");
