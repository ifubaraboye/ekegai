import AnsiParser from "ansi-parser"

export interface TextSegment {
  text: string
  fg?: string
  bg?: string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
}

export interface StyledLine {
  segments: TextSegment[]
}

interface StyleState {
  fg?: string
  bg?: string
  bold: boolean
  dim: boolean
  italic: boolean
  underline: boolean
}

function sgrCodeToColor(code: number, prefix: "38" | "48", params: number[]): string | undefined {
  if (code === 5 && params.length >= 1) {
    return ansi256ToHex(params[0])
  }
  if (code === 2 && params.length >= 3) {
    return `#${params[0].toString(16).padStart(2, "0")}${params[1].toString(16).padStart(2, "0")}${params[2].toString(16).padStart(2, "0")}`
  }
  return undefined
}

function ansi256ToHex(code: number): string {
  if (code < 16) {
    const standard = [
      "#000000", "#800000", "#008000", "#808000",
      "#000080", "#800080", "#008080", "#c0c0c0",
      "#808080", "#ff0000", "#00ff00", "#ffff00",
      "#0000ff", "#ff00ff", "#00ffff", "#ffffff",
    ]
    return standard[code]
  }
  if (code < 232) {
    const n = code - 16
    const r = (n / 36) | 0
    const g = ((n % 36) / 6) | 0
    const b = n % 6
    const scale = (v: number) => {
      const val = v * 40 + 55
      return val.toString(16).padStart(2, "0")
    }
    return `#${scale(r)}${scale(g)}${scale(b)}`
  }
  const gray = (code - 232) * 10 + 8
  const g = gray.toString(16).padStart(2, "0")
  return `#${g}${g}${g}`
}

const STANDARD_FG: Record<number, string> = {
  30: "#000000", 31: "#800000", 32: "#008000", 33: "#808000",
  34: "#000080", 35: "#800080", 36: "#008080", 37: "#c0c0c0",
  90: "#808080", 91: "#ff0000", 92: "#00ff00", 93: "#ffff00",
  94: "#0000ff", 95: "#ff00ff", 96: "#00ffff", 97: "#ffffff",
}

const STANDARD_BG: Record<number, string> = {
  40: "#000000", 41: "#800000", 42: "#008000", 43: "#808000",
  44: "#000080", 45: "#800080", 46: "#008080", 47: "#c0c0c0",
  100: "#808080", 101: "#ff0000", 102: "#00ff00", 103: "#ffff00",
  104: "#0000ff", 105: "#ff00ff", 106: "#00ffff", 107: "#ffffff",
}

function parseSgrSequence(params: number[], state: StyleState): void {
  if (params.length === 0 || params[0] === 0) {
    state.fg = undefined
    state.bg = undefined
    state.bold = false
    state.dim = false
    state.italic = false
    state.underline = false
    return
  }

  let i = 0
  while (i < params.length) {
    const code = params[i]
    switch (code) {
      case 1: state.bold = true; break
      case 2: state.dim = true; break
      case 3: state.italic = true; break
      case 4: state.underline = true; break
      case 22: state.bold = false; state.dim = false; break
      case 23: state.italic = false; break
      case 24: state.underline = false; break
      case 38:
        if (i + 1 < params.length) {
          const color = sgrCodeToColor(params[i + 1], "38", params.slice(i + 2))
          if (color) {
            state.fg = color
            i += params[i + 1] === 5 ? 2 : 4
          }
        }
        break
      case 48:
        if (i + 1 < params.length) {
          const color = sgrCodeToColor(params[i + 1], "48", params.slice(i + 2))
          if (color) {
            state.bg = color
            i += params[i + 1] === 5 ? 2 : 4
          }
        }
        break
      case 39: state.fg = undefined; break
      case 49: state.bg = undefined; break
      default:
        if (code in STANDARD_FG) state.fg = STANDARD_FG[code]
        else if (code in STANDARD_BG) state.bg = STANDARD_BG[code]
        break
    }
    i++
  }
}

function parseStyleString(style: string): Partial<StyleState> {
  const state: StyleState = { bold: false, dim: false, italic: false, underline: false }
  const re = /\x1b\[([0-9;]*)m/g
  let match: RegExpExecArray | null
  while ((match = re.exec(style)) !== null) {
    if (!match[1]) {
      state.fg = undefined
      state.bg = undefined
      state.bold = false
      state.dim = false
      state.italic = false
      state.underline = false
      continue
    }
    const params = match[1].split(";").map(Number)
    parseSgrSequence(params, state)
  }
  return state
}

function statesEqual(a: Partial<StyleState>, b: Partial<StyleState>): boolean {
  return a.fg === b.fg && a.bg === b.bg &&
    a.bold === b.bold && a.dim === b.dim &&
    a.italic === b.italic && a.underline === b.underline
}

function stateToSeg(state: Partial<StyleState>, text: string): TextSegment {
  return {
    text,
    fg: state.fg,
    bg: state.bg,
    bold: state.bold || undefined,
    dim: state.dim || undefined,
    italic: state.italic || undefined,
    underline: state.underline || undefined,
  }
}

export function parseAnsi(raw: string): StyledLine[] {
  const tokens = AnsiParser.parse(raw)
  const lines: StyledLine[] = []
  let currentLine: TextSegment[] = []
  let currentState: Partial<StyleState> = {}
  let currentText = ""

  function flushSegment() {
    if (currentText) {
      currentLine.push(stateToSeg(currentState, currentText))
      currentText = ""
    }
  }

  function finishLine() {
    flushSegment()
    if (currentLine.length > 0) {
      lines.push({ segments: currentLine })
      currentLine = []
    }
  }

  for (const token of tokens) {
    if (token.content === "\n") {
      finishLine()
      currentState = {}
      continue
    }

    const newState = parseStyleString(token.style)

    if (!statesEqual(newState, currentState)) {
      flushSegment()
      currentState = newState
    }

    currentText += token.content
  }

  flushSegment()
  if (currentLine.length > 0) {
    lines.push({ segments: currentLine })
  }

  return lines
}

const MAX_LINES = 2000

export function appendToBuffer(buffer: StyledLine[], newLines: StyledLine[]): StyledLine[] {
  const combined = [...buffer, ...newLines]
  if (combined.length > MAX_LINES) {
    return combined.slice(combined.length - MAX_LINES)
  }
  return combined
}
