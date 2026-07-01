// make-tray-icon.mjs — generate the macOS menu-bar tray icon for Mikan.
//
// Draws the Mikan mark (a rounded diamond outline + center dot) as a monochrome
// *template* PNG: black (RGB 0,0,0) with the shape carried in the alpha channel,
// so macOS recolors it for light/dark menu bars. No image deps — a tiny hand-rolled
// PNG encoder over Node's built-in zlib. Run: `node scripts/make-tray-icon.mjs`.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'resources', 'trayTemplate.png')

const SIZE = 32 // 2x of a ~16pt menu-bar icon
const C = SIZE / 2 // center
const R = 12.5 // diamond half-diagonal (L1 radius)
const STROKE = 2.0 // outline thickness (px)
const DOT = 2.2 // center-dot radius (px)

// per-pixel alpha coverage with ~1px anti-aliasing
function alphaAt(px, py) {
  const x = px + 0.5 - C
  const y = py + 0.5 - C
  // diamond outline: ring around the L1 circle |x|+|y| = R
  const l1 = Math.abs(x) + Math.abs(y)
  const ring = clamp01(STROKE / 2 - Math.abs(l1 - R) + 0.5)
  // center dot: filled euclidean disc
  const d = Math.hypot(x, y)
  const dot = clamp01(DOT - d + 0.5)
  return Math.max(ring, dot)
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

// RGBA scanlines, each prefixed with filter byte 0
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
let o = 0
for (let y = 0; y < SIZE; y++) {
  raw[o++] = 0 // filter: none
  for (let x = 0; x < SIZE; x++) {
    const a = Math.round(alphaAt(x, y) * 255)
    raw[o++] = 0 // R
    raw[o++] = 0 // G
    raw[o++] = 0 // B
    raw[o++] = a // A
  }
}

// --- minimal PNG encoder ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type: RGBA
// 10,11,12 = compression/filter/interlace = 0

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, png)
console.log(`wrote ${OUT} (${SIZE}x${SIZE}, ${png.length} bytes)`)
