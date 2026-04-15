import { useState, useCallback } from "react";
import { useWorkflowStore } from "../store/workflowStore";
import { Plus, X, ChevronDown, ChevronRight, FolderOpen } from "lucide-react";

const PROJECT_ACCENTS = [
  "#bd93f9",
  "#ff79c6",
  "#50fa7b",
  "#8be9fd",
  "#ffb86c",
  "#f1fa8c",
  "#ff5555",
  "#6272a4",
];
function projectAccent(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++)
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return PROJECT_ACCENTS[Math.abs(hash) % PROJECT_ACCENTS.length];
}

export function Sidebar() {
  const {
    nodes,
    projects,
    activeProjectId,
    activeTerminalId,
    addProject,
    removeProject,
    setActiveProject,
    setActiveTerminalId,
    deleteNode,
    addNode,
  } = useWorkflowStore();

  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set(),
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleOpenProject = useCallback(async () => {
    const result = await window.electronAPI?.openFolder();
    if (result && !result.canceled && result.path) {
      const id = addProject(result.path);
      setExpandedProjects((prev) => new Set(prev).add(id as string));
    }
  }, [addProject]);

  const handleAddTerminal = useCallback(
    (e: React.MouseEvent, projectId: string) => {
      e.stopPropagation();
      addNode({ x: 0, y: 0 }, projectId);
    },
    [addNode],
  );

  const handleTerminalClick = useCallback(
    (nodeId: string, projectId: string) => {
      setActiveProject(projectId);
      setActiveTerminalId(nodeId);
    },
    [setActiveProject, setActiveTerminalId],
  );

  const handleDeleteTerminal = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      deleteNode(nodeId);
      if (activeTerminalId === nodeId) setActiveTerminalId(null);
    },
    [deleteNode, activeTerminalId, setActiveTerminalId],
  );

  const getNodesByProject = useCallback(
    (projectId: string) => nodes.filter((n) => n.data.projectId === projectId),
    [nodes],
  );

  const handleProjectRowKeyDown = useCallback(
    (e: React.KeyboardEvent, projectId: string) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      setActiveProject(projectId);
      toggleExpanded(projectId);
    },
    [setActiveProject, toggleExpanded],
  );

  const handleTerminalRowKeyDown = useCallback(
    (e: React.KeyboardEvent, nodeId: string, projectId: string) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      handleTerminalClick(nodeId, projectId);
    },
    [handleTerminalClick],
  );

  return (
    <aside className="ekegai-sidebar">
      <div className="sidebar-wordmark">
        <span className="wordmark-text">ekegai</span>
        <button
          className="sidebar-new-btn"
          onClick={handleOpenProject}
          title="Open project"
        >
          <Plus size={13} strokeWidth={2} />
        </button>
      </div>

      <div className="sidebar-scroll">
        {projects.length === 0 ? (
          <button className="sidebar-empty-cta" onClick={handleOpenProject}>
            <FolderOpen size={15} />
            <span>Open a project</span>
          </button>
        ) : (
          projects.map((project) => {
            const projectNodes = getNodesByProject(project.id);
            const isExpanded = expandedProjects.has(project.id);
            const isActive = activeProjectId === project.id;
            const accent = projectAccent(project.id);
            const initial = project.name.charAt(0).toUpperCase();

            return (
              <div key={project.id} className="project-group">
                <div
                  className={`project-row ${isActive ? "project-row--active" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setActiveProject(project.id);
                    toggleExpanded(project.id);
                  }}
                  onKeyDown={(e) => handleProjectRowKeyDown(e, project.id)}
                >
                  <span className="chevron">
                    {isExpanded ? (
                      <ChevronDown size={11} strokeWidth={2.5} />
                    ) : (
                      <ChevronRight size={11} strokeWidth={2.5} />
                    )}
                  </span>

                  <span
                    className="project-avatar"
                    style={{
                      background: accent + "22",
                      color: accent,
                      borderColor: accent + "44",
                    }}
                  >
                    {initial}
                  </span>

                  <span className="project-name">{project.name}</span>

                  <button
                    type="button"
                    className="row-action"
                    onClick={(e) => handleAddTerminal(e, project.id)}
                    title="New terminal"
                  >
                    <Plus size={11} strokeWidth={2.5} />
                  </button>
                  <button
                    type="button"
                    className="row-action"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeProject(project.id);
                    }}
                    title="Close project"
                  >
                    <X size={11} strokeWidth={2.5} />
                  </button>
                </div>

                {isExpanded && (
                  <div className="terminal-group">
                    {projectNodes.length === 0 ? (
                      <button
                        type="button"
                        className="terminal-empty"
                        onClick={(e) => handleAddTerminal(e, project.id)}
                      >
                        <Plus size={11} /> <span>New terminal</span>
                      </button>
                    ) : (
                      projectNodes.map((node) => {
                        const isActiveNode = activeTerminalId === node.id;
                        const label = node.data.label || "terminal";

                        return (
                          <div
                            key={node.id}
                            className={`terminal-row ${isActiveNode ? "terminal-row--active" : ""}`}
                            role="button"
                            tabIndex={0}
                            onClick={() =>
                              handleTerminalClick(node.id, project.id)
                            }
                            onKeyDown={(e) =>
                              handleTerminalRowKeyDown(e, node.id, project.id)
                            }
                          >
                            <span
                              className={`status-dot ${isActiveNode ? "status-dot--live" : ""}`}
                            />

                            <span className="terminal-label">{label}</span>

                            <button
                              type="button"
                              className="row-action terminal-kill"
                              onClick={(e) => handleDeleteTerminal(e, node.id)}
                              title="Kill terminal"
                            >
                              <X size={11} strokeWidth={2.5} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
