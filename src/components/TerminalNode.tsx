import { useCallback, useEffect, useRef, useMemo } from "react";
import { Handle, Position, NodeProps, NodeResizer } from "@xyflow/react";
import { usePty } from "../hooks/usePty";
import {
  CheckCircle,
  XCircle,
  Loader2,
  Terminal as TerminalIcon,
} from "lucide-react";
import { type TerminalNodeData } from "../store/workflowStore";

type Props = NodeProps<TerminalNodeData>;

const stateColors = {
  idle: "border-terminal-border",
  running: "border-amber-500",
  done: "border-green-500",
  error: "border-red-500",
};

const statePulsing = {
  idle: "",
  running: "node-pulse-amber",
  done: "node-pulse-green",
  error: "node-pulse-red",
};

export function TerminalNode({ id, data }: Props) {
  const terminalRef = useRef<HTMLDivElement>(null);

  const { init, fit, terminal, fitAddon } = usePty({
    ptyId: data.ptyId,
    onReady: (term, fitAdd) => {
      if (terminalRef.current) {
        term.open(terminalRef.current);
        setTimeout(() => {
          fitAdd.fit();
        }, 100);
      }
    },
  });

  useEffect(() => {
    if (terminalRef.current && terminal) {
      terminal.open(terminalRef.current);
      setTimeout(() => {
        fit();
      }, 100);
    }
  }, [terminal, fit]);

  useEffect(() => {
    if (!terminalRef.current) return;

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fit();
      });
    });
    observer.observe(terminalRef.current);

    return () => {
      observer.disconnect();
    };
  }, [fit]);

  const handleResize = useCallback(() => {
    fit();
  }, [fit]);

  const stateIcon = useMemo(() => {
    switch (data.agentState) {
      case "running":
        return <Loader2 className="animate-spin" size={14} />;
      case "done":
        return <CheckCircle size={14} className="text-green-500" />;
      case "error":
        return <XCircle size={14} className="text-red-500" />;
      default:
        return <TerminalIcon size={14} />;
    }
  }, [data.agentState]);

  return (
    <div
      className={`bg-terminal-bg border-2 ${stateColors[data.agentState]} ${statePulsing[data.agentState]} rounded-lg overflow-hidden`}
      style={{ minWidth: 300, minHeight: 200 }}
    >
      <NodeResizer onResize={handleResize} minWidth={300} minHeight={200} />

      <div className="bg-terminal-bg border-b border-terminal-border px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TerminalIcon size={14} className="text-gray-400" />
          <span className="text-terminal-text text-sm font-medium">
            {data.label}
          </span>
        </div>
        <div className="text-gray-400">{stateIcon}</div>
      </div>

      <Handle type="target" position={Position.Left} className="!bg-blue-400" />

      <div
        ref={terminalRef}
        className="terminal-container"
        style={{
          height: 180,
          background: "#1a1a1a",
          padding: 4,
        }}
      />

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-blue-400"
      />
    </div>
  );
}
