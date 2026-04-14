import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

interface UsePtyOptions {
  ptyId: string;
  cols?: number;
  rows?: number;
  onReady?: (terminal: Terminal, fitAddon: FitAddon) => void;
}

export function usePty({
  ptyId,
  cols = 80,
  rows = 24,
  onReady,
}: UsePtyOptions) {
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const init = useCallback(() => {
    if (!ptyId || terminalRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: "#1a1a1a",
        foreground: "#cccccc",
        cursor: "#cccccc",
        selection: "rgba(255, 255, 255, 0.3)",
        black: "#000000",
        red: "#ff5555",
        green: "#50fa7b",
        yellow: "#f1fa8c",
        blue: "#bd93f9",
        magenta: "#ff79c6",
        cyan: "#8be9fd",
        white: "#bfbfbf",
        brightBlack: "#4d4d4d",
        brightRed: "#ff6e6e",
        brightGreen: "#5af78e",
        brightYellow: "#f4f75c",
        brightBlue: "#cba1f7",
        brightMagenta: "#ff92d0",
        brightCyan: "#9aedfe",
        brightWhite: "#e6e6e6",
      },
      allowTransparency: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    window.electronAPI?.ptyCreate(ptyId, cols, rows);

    const unsub = window.electronAPI?.onPtyOutput(ptyId, (data) => {
      terminal.write(data);
    });

    cleanupRef.current = () => {
      unsub?.();
      window.electronAPI?.ptyKill(ptyId);
      terminal.dispose();
    };

    if (onReady) {
      onReady(terminal, fitAddon);
    }
  }, [ptyId, cols, rows, onReady]);

  const write = useCallback(
    (data: string) => {
      window.electronAPI?.ptyInput(ptyId, data);
    },
    [ptyId],
  );

  const resize = useCallback(
    (cols: number, rows: number) => {
      window.electronAPI?.ptyResize(ptyId, cols, rows);
    },
    [ptyId],
  );

  const fit = useCallback(() => {
    if (fitAddonRef.current) {
      fitAddonRef.current.fit();
      const { cols, rows } = fitAddonRef.current.proposeDimensions() || {
        cols: 80,
        rows: 24,
      };
      resize(cols, rows);
    }
  }, [resize]);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  return {
    terminal: terminalRef.current,
    fitAddon: fitAddonRef.current,
    init,
    write,
    resize,
    fit,
  };
}
