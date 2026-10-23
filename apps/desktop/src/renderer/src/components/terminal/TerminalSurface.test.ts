import { mount } from "@vue/test-utils"
import { expect, test, vi } from "vitest"

const terminals: FakeTerminal[] = []
const fits: { fit: ReturnType<typeof vi.fn> }[] = []

class FakeTerminal {
  options: Record<string, unknown>
  open = vi.fn()
  write = vi.fn()
  dispose = vi.fn()
  loadAddon = vi.fn()
  constructor(options: Record<string, unknown>) {
    this.options = options
    terminals.push(this)
  }
}

vi.mock("@xterm/xterm", () => ({ Terminal: FakeTerminal }))
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit = vi.fn()
    constructor() {
      fits.push(this)
    }
  },
}))

const { default: TerminalSurface } = await import("./TerminalSurface.vue")

test("opens a read-only xterm.js terminal that fits its container", () => {
  const wrapper = mount(TerminalSurface, { props: { banner: "first\nsecond" } })
  const [terminal] = terminals
  const [fit] = fits

  // Input stays disabled until a session transport exists.
  expect(terminal!.options.disableStdin).toBe(true)
  expect(terminal!.loadAddon).toHaveBeenCalledWith(fit)
  expect(terminal!.open).toHaveBeenCalledWith(wrapper.element)
  expect(fit!.fit).toHaveBeenCalled()
  expect(terminal!.write).toHaveBeenNthCalledWith(1, "\x1b[?25l")
  // xterm.js needs carriage returns to start the next line at column zero.
  expect(terminal!.write).toHaveBeenNthCalledWith(2, "first\r\nsecond")

  wrapper.unmount()
  expect(terminal!.dispose).toHaveBeenCalledOnce()
})
