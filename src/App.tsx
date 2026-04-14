import { useCallback, useState, useEffect } from "react";
import { TileContainer } from "./components/TileContainer";
import { NodeContextMenu } from "./components/NodeContextMenu";
import { AgentConfigModal } from "./components/AgentConfigModal";
import { useWorkflowStore } from "./store/workflowStore";
import { Plus, Menu, MenuSquare } from "lucide-react";

function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const onAddNode = useCallback(() => {
    const store = useWorkflowStore.getState();
    const ptyId = store.addNode({ x: 0, y: 0 });
    if (ptyId && window.electronAPI) {
      window.electronAPI.ptyCreate(ptyId, 80, 24);
    }
  }, []);

  return (
    <div className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <button
        className="sidebar-toggle"
        onClick={onToggle}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <MenuSquare size={20} /> : <Menu size={20} />}
      </button>
      <div className="sidebar-divider" />
      <button className="sidebar-item" onClick={onAddNode} title="New terminal">
        <Plus size={22} />
        {!collapsed && <span className="sidebar-label">New</span>}
      </button>
    </div>
  );
}

export default function App() {
  const [isDark, setIsDark] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
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
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <div
        className={`tile-container-wrapper ${
          sidebarCollapsed ? "sidebar-collapsed" : ""
        }`}
      >
        <TileContainer />
      </div>

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
