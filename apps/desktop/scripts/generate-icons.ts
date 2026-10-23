// Regenerates the placeholder application and tray icons in build/.
// Run with `pnpm --filter @deskfleet/desktop icons` and commit the output.
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { crc32, deflateSync } from "node:zlib"

type Color = readonly [red: number, green: number, blue: number]
/** Whether a point in unit coordinates lies inside a shape. */
type Shape = (x: number, y: number) => boolean
interface Layer {
  shape: Shape
  color: (x: number, y: number) => Color
}

const SAMPLES = 4
const buildDirectory = resolve(import.meta.dirname, "../build")

function roundedRect(x0: number, y0: number, x1: number, y1: number, radius: number): Shape {
  return (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false
    const dx = Math.max(x0 + radius - x, 0, x - (x1 - radius))
    const dy = Math.max(y0 + radius - y, 0, y - (y1 - radius))
    return dx * dx + dy * dy <= radius * radius
  }
}

function union(...shapes: Shape[]): Shape {
  return (x, y) => shapes.some((shape) => shape(x, y))
}

function difference(outer: Shape, inner: Shape): Shape {
  return (x, y) => outer(x, y) && !inner(x, y)
}

/** Maps a shape drawn in the unit square into the box at (left, top) with the given size. */
function place(shape: Shape, left: number, top: number, size: number): Shape {
  return (x, y) => shape((x - left) / size, (y - top) / size)
}

// A display on a stand: one machine in the fleet.
const display = union(
  difference(roundedRect(0.04, 0.12, 0.96, 0.72, 0.1), roundedRect(0.14, 0.22, 0.86, 0.62, 0.03)),
  roundedRect(0.43, 0.7, 0.57, 0.84, 0),
  roundedRect(0.26, 0.82, 0.74, 0.92, 0.05),
)

const white: Color = [255, 255, 255]
const black: Color = [0, 0, 0]
const top: Color = [99, 102, 241]
const bottom: Color = [55, 48, 163]

function gradient(_x: number, y: number): Color {
  const mix = (from: number, to: number) => from + (to - from) * y
  return [mix(top[0], bottom[0]), mix(top[1], bottom[1]), mix(top[2], bottom[2])]
}

/** Rasterizes layers back to front with straight-alpha source-over compositing. */
function render(size: number, layers: Layer[]): Uint8Array {
  const pixels = new Uint8Array(size * size * 4)
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      let [red, green, blue, alpha] = [0, 0, 0, 0]
      for (const layer of layers) {
        let hits = 0
        for (let sy = 0; sy < SAMPLES; sy++) {
          for (let sx = 0; sx < SAMPLES; sx++) {
            const x = (column + (sx + 0.5) / SAMPLES) / size
            const y = (row + (sy + 0.5) / SAMPLES) / size
            if (layer.shape(x, y)) hits++
          }
        }
        const coverage = hits / (SAMPLES * SAMPLES)
        if (coverage === 0) continue
        const [r, g, b] = layer.color((column + 0.5) / size, (row + 0.5) / size)
        const outAlpha = coverage + alpha * (1 - coverage)
        red = (r * coverage + red * alpha * (1 - coverage)) / outAlpha
        green = (g * coverage + green * alpha * (1 - coverage)) / outAlpha
        blue = (b * coverage + blue * alpha * (1 - coverage)) / outAlpha
        alpha = outAlpha
      }
      pixels.set(
        [red, green, blue, alpha * 255].map(Math.round),
        (row * size + column) * 4,
      )
    }
  }
  return pixels
}

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, checksum])
}

function encodePng(size: number, pixels: Uint8Array): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 6, 0, 0, 0], 8) // 8-bit RGBA, no interlacing
  const rows = Buffer.alloc(size * (size * 4 + 1))
  for (let row = 0; row < size; row++) {
    // Each scanline starts with filter type 0 (none).
    rows.set(pixels.subarray(row * size * 4, (row + 1) * size * 4), row * (size * 4 + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", new Uint8Array()),
  ])
}

function write(name: string, size: number, layers: Layer[]): void {
  writeFileSync(resolve(buildDirectory, name), encodePng(size, render(size, layers)))
}

// electron-builder derives the macOS .icns and Windows .ico from this image.
// The body follows the macOS icon grid: 824 of 1024 pixels with a 0.2237 corner ratio.
const appIcon: Layer[] = [
  { shape: roundedRect(0.098, 0.098, 0.902, 0.902, 0.18), color: gradient },
  { shape: place(display, 0.24, 0.22, 0.52), color: () => white },
]
write("icon.png", 1024, appIcon)

// Windows and Linux trays show full-color icons on panels of either brightness.
const trayIcon: Layer[] = [
  { shape: roundedRect(0.02, 0.02, 0.98, 0.98, 0.22), color: gradient },
  { shape: place(display, 0.14, 0.12, 0.72), color: () => white },
]
write("tray.png", 16, trayIcon)
write("tray@2x.png", 32, trayIcon)

// macOS menu bar images are black-and-alpha templates the system tints.
const trayTemplate: Layer[] = [{ shape: place(display, 0, 0, 1), color: () => black }]
write("trayTemplate.png", 16, trayTemplate)
write("trayTemplate@2x.png", 32, trayTemplate)
