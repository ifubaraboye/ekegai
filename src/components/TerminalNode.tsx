import { useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps, NodeResizer } from "@xyflow/react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { type TerminalNodeData } from "../store/workflowStore";

type Props = NodeProps<TerminalNodeData>;

export function TerminalNode({ id, data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: "#0d0d0d",
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
      scrollback: 0,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    window.electronAPI?.ptyCreate(data.ptyId, 80, 24);

    terminal.onData((inputData) => {
      window.electronAPI?.ptyInput(data.ptyId, inputData);
    });

    terminal.onBinary((binaryData) => {
      window.electronAPI?.ptyInput(data.ptyId, binaryData);
    });

    const unsub = window.electronAPI?.onPtyOutput(data.ptyId, (outputData) => {
      terminal.write(outputData);
    });

    terminal.open(containerRef.current);
    setTimeout(() => {
      fitAddon.fit();
      setIsReady(true);
    }, 50);

    return () => {
      unsub?.();
      window.electronAPI?.ptyKill(data.ptyId);
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [data.ptyId]);

  const handleResize = useCallback(() => {
    if (fitAddonRef.current) {
      fitAddonRef.current.fit();
      const dims = fitAddonRef.current.proposeDimensions();
      if (dims) {
        window.electronAPI?.ptyResize(data.ptyId, dims.cols, dims.rows);
      }
    }
  }, [data.ptyId]);

  useEffect(() => {
    if (!containerRef.current || !isReady) return;

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        handleResize();
      });
    });
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [isReady, handleResize]);

  return (
    <div
      style={{
        background: "#0d0d0d",
        overflow: "hidden",
        border: "1px solid #333",
        borderRadius: 0,
        minWidth: 280,
        minHeight: 180,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: "#666" }}
      />

      <div
        ref={containerRef}
        style={{
          height: 180,
          padding: 4,
        }}
      />

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: "#666" }}
      />

      <NodeResizer
        onResize={handleResize}
        minWidth={280}
        minHeight={180}
        style={{
          borderColor: "#4a9eff",
        }}
      />
    </div>
  );
}
