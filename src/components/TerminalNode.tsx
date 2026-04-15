import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import {
  type TerminalNodeData,
  useWorkflowStore,
} from "../store/workflowStore";

interface Props {
  id: string;
  data: TerminalNodeData;
  isActive?: boolean;
}

export function TerminalNode({ id, data, isActive }: Props) {
  const deleteNode = useWorkflowStore((s) => s.deleteNode);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const oscBufferRef = useRef("");

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 15,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      allowProposedApi: true,
      theme: {
        background: "#111111",
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
      convertEol: true,
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    window.electronAPI?.ptyCreate(data.ptyId, 80, 24, data.cwd);

    terminal.onData((inputData) => {
      window.electronAPI?.ptyInput(data.ptyId, inputData);
    });

    terminal.onBinary((binaryData) => {
      window.electronAPI?.ptyInput(data.ptyId, binaryData);
    });

    const parseOscTitle = (chunk: string): string | null => {
      const combined = oscBufferRef.current + chunk;
      const match = combined.match(
        /\x1b\](0|2);([^\x07\x1b]*?)(?:\x07|\x1b\\)/,
      );
      if (match) {
        oscBufferRef.current = "";
        const title = match[2].trim();
        return title.length > 0 && title.length < 80 ? title : null;
      }
      const partial = combined.match(/\x1b\](0|2);[^\x07\x1b]*$/);
      oscBufferRef.current = partial ? partial[0].slice(-128) : "";
      return null;
    };

    const unsub = window.electronAPI?.onPtyOutput(data.ptyId, (outputData) => {
      terminal.write(outputData);
      const title = parseOscTitle(outputData);
      if (title) {
        updateNodeData(id, { label: title });
      }
    });

    terminal.open(containerRef.current);

    setTimeout(() => {
      fitAddon.fit();
    }, 100);

    return () => {
      unsub?.();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [data.ptyId, data.cwd, id, updateNodeData]);

  useEffect(() => {
    if (
      isActive &&
      terminalRef.current &&
      containerRef.current &&
      fitAddonRef.current
    ) {
      terminalRef.current.focus();
      setTimeout(() => {
        fitAddonRef.current?.fit();
        const dims = fitAddonRef.current?.proposeDimensions();
        if (dims && dims.cols > 0 && dims.rows > 0) {
          window.electronAPI?.ptyResize(data.ptyId, dims.cols, dims.rows);
        }
        terminalRef.current?.refresh(0, terminalRef.current.rows - 1);
      }, 100);
    }
  }, [isActive, data.ptyId]);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (fitAddonRef.current) {
          fitAddonRef.current.fit();
          const dims = fitAddonRef.current.proposeDimensions();
          if (dims && dims.cols > 0 && dims.rows > 0) {
            window.electronAPI?.ptyResize(data.ptyId, dims.cols, dims.rows);
          }
        }
      });
    });
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [data.ptyId]);

  return (
    <div
      className="terminal-tile"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="terminal-content" ref={containerRef} />
      {isHovered && (
        <button
          className="terminal-close-floating"
          onClick={() => deleteNode(id)}
          title="Close terminal"
        >
          ×
        </button>
      )}
    </div>
  );
}
