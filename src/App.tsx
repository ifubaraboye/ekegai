import { useCallback, useState, useEffect } from "react";
import { TileContainer } from "./components/TileContainer";
import { NodeContextMenu } from "./components/NodeContextMenu";
import { AgentConfigModal } from "./components/AgentConfigModal";
import { useWorkflowStore } from "./store/workflowStore";
import { Save, FolderOpen, Plus, Moon, Sun } from "lucide-react";

function Sidebar({
  isDark,
  onToggleTheme,
}: {
  isDark: boolean;
  onToggleTheme: () => void;
}) {
  const onAddNode = useCallback(() => {
    const store = useWorkflowStore.getState();
    const ptyId = store.addNode({ x: 0, y: 0 });
    if (ptyId && window.electronAPI) {
      window.electronAPI.ptyCreate(ptyId, 80, 24);
    }
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
      <button className="sidebar-item" onClick={onAddNode} title="Add terminal">
        <Plus size={22} />
      </button>
      <div className="sidebar-divider" />
      <button
        className="sidebar-item"
        onClick={onToggleTheme}
        title="Toggle theme"
      >
        {isDark ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <button className="sidebar-item" onClick={onSave} title="Save workflow">
        <Save size={18} />
      </button>
      <button className="sidebar-item" onClick={onLoad} title="Load workflow">
        <FolderOpen size={18} />
      </button>
    </div>
  );
}

export default function App() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const newValue = !prev;
      if (newValue) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      return newValue;
    });
  }, []);

  const {
    setContextMenu,
    contextMenuPosition,
    selectedNodeId,
    setSelectedNode,
    deleteNode,
    isAgentConfigModalOpen,
    configModalNodeId,
    openAgentConfig,
    closeAgentConfig,
  } = useWorkflowStore();

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
    <div className="app-container">
      <Sidebar isDark={isDark} onToggleTheme={toggleTheme} />
      <TileContainer />

      {contextMenuPosition && (
        <NodeContextMenu
          position={contextMenuPosition}
          onAction={handleContextMenuAction}
          onClose={() => setContextMenu(null)}
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
