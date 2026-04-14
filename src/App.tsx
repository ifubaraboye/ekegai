import { useCallback, useState, DragEvent } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { TerminalNode } from "./components/TerminalNode";
import { NodeContextMenu } from "./components/NodeContextMenu";
import { AgentConfigModal } from "./components/AgentConfigModal";
import { useWorkflowStore } from "./store/workflowStore";
import { Terminal, Save, FolderOpen } from "lucide-react";

const nodeTypes = { terminal: TerminalNode };

function Sidebar() {
  const [dragging, setDragging] = useState(false);

  const onDragStart = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData("application/reactflow", "terminal");
    event.dataTransfer.effectAllowed = "move";
    setDragging(true);
  }, []);

  const onDragEnd = useCallback(() => {
    setDragging(false);
  }, []);

  const onSave = async () => {
    const store = useWorkflowStore.getState();
    const data = store.serialize();
    await window.electronAPI?.saveWorkflow(data);
  };

  const onLoad = async () => {
    const result = await window.electronAPI?.loadWorkflow();
    if (result && !result.canceled && result.data) {
      const store = useWorkflowStore.getState();
      store.load(result.data);
    }
  };

  return (
    <div className="sidebar">
      <div
        className={`sidebar-item ${dragging ? "opacity-50" : ""}`}
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        title="Drag to create terminal node"
      >
        <Terminal size={22} />
      </div>
      <div className="w-full h-px bg-border my-2" />
      <div className="sidebar-item" onClick={onSave} title="Save workflow">
        <Save size={18} />
      </div>
      <div className="sidebar-item" onClick={onLoad} title="Load workflow">
        <FolderOpen size={18} />
      </div>
    </div>
  );
}

export default function App() {
  const {
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    setContextMenu,
    contextMenuPosition,
    selectedNodeId,
    setSelectedNode,
    deleteNode,
    isAgentConfigModalOpen,
    configModalNodeId,
    openAgentConfig,
    closeAgentConfig,
    nodes,
    edges,
  } = useWorkflowStore();

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const type = event.dataTransfer.getData("application/reactflow");
    if (!type) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const position = {
      x: event.clientX - bounds.left - 60,
      y: event.clientY - bounds.top,
    };

    const newNode = useWorkflowStore.getState().addNode(position);
    window.electronAPI?.ptyCreate(newNode.data.ptyId, 80, 24);
  }, []);

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: any) => {
      event.preventDefault();
      setSelectedNode(node.id);
      setContextMenu({ x: event.clientX, y: event.clientY });
    },
    [setSelectedNode, setContextMenu],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, [setContextMenu]);

  const handleContextMenuAction = useCallback(
    (action: string) => {
      if (!selectedNodeId) return;

      const store = useWorkflowStore.getState();
      switch (action) {
        case "run": {
          const node = store.nodes.find((n) => n.id === selectedNodeId);
          if (node?.data.agentConfig) {
            const downstream = store.getDownstreamNodes(selectedNodeId);
            let inputData = node.data.lastOutput || "";

            for (const downstreamNode of downstream) {
              if (downstreamNode.data.agentConfig) {
                store.runAgent(downstreamNode.id, inputData);
              }
            }

            if (downstream.length === 0) {
              store.runAgent(selectedNodeId, inputData);
            }
          }
          break;
        }
        case "configure":
          openAgentConfig(selectedNodeId);
          break;
        case "delete":
          deleteNode(selectedNodeId);
          break;
        case "terminal":
          break;
      }
      setContextMenu(null);
    },
    [selectedNodeId, deleteNode, openAgentConfig, setContextMenu],
  );

  return (
    <div className="canvas-wrapper">
      <Sidebar />
      <ReactFlow
        nodes={nodes as any}
        edges={edges as any}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={closeContextMenu}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{ type: "smoothstep" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#333"
        />
        <Controls />
        <MiniMap
          nodeColor="#444"
          maskColor="rgba(0,0,0,0.5)"
          style={{ background: "#222" }}
        />
      </ReactFlow>

      {contextMenuPosition && (
        <NodeContextMenu
          position={contextMenuPosition}
          onAction={handleContextMenuAction}
          onClose={closeContextMenu}
        />
      )}

      {isAgentConfigModalOpen && configModalNodeId && (
        <AgentConfigModal
          nodeId={configModalNodeId}
          onClose={closeAgentConfig}
        />
      )}
    </div>
  );
}
