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
import {
  Terminal,
  Save,
  FolderOpen,
  Plus,
  Trash2,
  Settings,
  Play,
} from "lucide-react";

const nodeTypes = { terminal: TerminalNode };

function Sidebar() {
  const [count, setCount] = useState(0);

  const onAddNode = useCallback(() => {
    const newCount = count + 1;
    setCount(newCount);
    const position = { x: 150 + newCount * 30, y: 100 + newCount * 30 };
    const newNode = useWorkflowStore.getState().addNode(position);
    window.electronAPI?.ptyCreate(newNode.data.ptyId, 80, 24);
  }, [count]);

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
      <button
        className="sidebar-item"
        onClick={onAddNode}
        title="Add terminal node (click or drag)"
      >
        <Plus size={22} />
      </button>
      <div className="sidebar-divider" />
      <button className="sidebar-item" onClick={onSave} title="Save workflow">
        <Save size={18} />
      </button>
      <button className="sidebar-item" onClick={onLoad} title="Load workflow">
        <FolderOpen size={18} />
      </button>
    </div>
  );
}

function EmptyCanvas() {
  const [count, setCount] = useState(0);

  const onAddFirst = useCallback(() => {
    const newCount = count + 1;
    setCount(newCount);
    const position = { x: 200, y: 150 };
    const newNode = useWorkflowStore.getState().addNode(position);
    window.electronAPI?.ptyCreate(newNode.data.ptyId, 80, 24);
  }, [count]);

  return (
    <div className="empty-state">
      <Terminal className="empty-state-icon" size={64} />
      <h3 className="empty-state-title">No terminals yet</h3>
      <p className="empty-state-description">
        Click the + button in the sidebar or drag from the sidebar to create a
        terminal node
      </p>
      <button
        className="btn btn-primary"
        onClick={onAddFirst}
        style={{ marginTop: 16 }}
      >
        <Plus size={16} style={{ marginRight: 6, verticalAlign: "middle" }} />
        Create Terminal
      </button>
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

  const [nodeCount, setNodeCount] = useState(0);

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow");
      if (!type) return;

      const bounds = event.currentTarget.getBoundingClientRect();
      const newCount = nodeCount + 1;
      setNodeCount(newCount);
      const position = {
        x: event.clientX - bounds.left - 64,
        y: event.clientY - bounds.top,
      };

      const newNode = useWorkflowStore.getState().addNode(position);
      window.electronAPI?.ptyCreate(newNode.data.ptyId, 80, 24);
    },
    [nodeCount],
  );

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
      {nodes.length === 0 ? (
        <EmptyCanvas />
      ) : (
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
            color="rgba(38, 37, 30, 0.08)"
          />
          <Controls />
          <MiniMap
            nodeColor="#26251e"
            maskColor="rgba(242, 241, 237, 0.8)"
            style={{ background: "#f2f1ed" }}
          />
        </ReactFlow>
      )}

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
