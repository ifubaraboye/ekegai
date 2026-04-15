import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useWorkflowStore } from "../store/workflowStore";

interface IDEContextMenuProps {
  projectPath: string;
  x: number;
  y: number;
  onClose: () => void;
}

export function IDEContextMenu({ projectPath, x, y, onClose }: IDEContextMenuProps) {
  const { availableIDEs, customIDEs, addCustomIDE } = useWorkflowStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCommand, setNewCommand] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  // Adjust position so menu never overflows viewport
  const [adjustedPos, setAdjustedPos] = useState({ x, y });

  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setAdjustedPos({
      x: x + rect.width > vw ? vw - rect.width - 8 : x,
      y: y + rect.height > vh ? vh - rect.height - 8 : y,
    });
  }, [x, y, showAddForm]);

  const handleOpenIDE = useCallback(
    async (command: string) => {
      await window.electronAPI?.ideOpen(projectPath, command);
      onClose();
    },
    [projectPath, onClose],
  );

  const handleAddIDE = useCallback(() => {
    if (newName.trim() && newCommand.trim()) {
      addCustomIDE({ name: newName.trim(), command: newCommand.trim() });
      setNewName("");
      setNewCommand("");
      setShowAddForm(false);
    }
  }, [newName, newCommand, addCustomIDE]);

  // Dismiss on outside click or Escape
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const allIDEs = [...availableIDEs, ...customIDEs];

  const menu = (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: adjustedPos.x,
        top: adjustedPos.y,
        background: "#1a1a1a",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "8px",
        boxShadow: "0 12px 40px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)",
        minWidth: "200px",
        padding: "4px 0",
        zIndex: 9999,
        fontFamily: '"SF Mono", "JetBrains Mono", ui-monospace, monospace',
      }}
    >
      {allIDEs.length > 0 ? (
        <>
          {allIDEs.map((ide) => (
            <button
              key={ide.name}
              className="ide-menu-item"
              onClick={() => handleOpenIDE(ide.command)}
            >
              <span className="ide-name">{ide.name}</span>
            </button>
          ))}
          <div className="ide-menu-divider" />
        </>
      ) : (
        <>
          <div
            style={{
              padding: "8px 14px 4px",
              fontSize: "11px",
              color: "rgba(200,198,192,0.3)",
              letterSpacing: "0.05em",
            }}
          >
            No IDEs detected
          </div>
          <div className="ide-menu-divider" />
        </>
      )}

      {!showAddForm ? (
        <button
          className="ide-menu-item ide-add-btn"
          onClick={() => setShowAddForm(true)}
        >
          <span style={{ fontSize: 13, color: "rgba(200,198,192,0.45)", marginRight: 2 }}>+</span>
          <span className="ide-name">Add IDE…</span>
        </button>
      ) : (
        <div className="ide-add-form">
          <input
            autoFocus
            type="text"
            placeholder="Name (e.g. Neovim)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddIDE();
              if (e.key === "Escape") setShowAddForm(false);
            }}
          />
          <input
            type="text"
            placeholder="Command (e.g. nvim)"
            value={newCommand}
            onChange={(e) => setNewCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddIDE();
              if (e.key === "Escape") setShowAddForm(false);
            }}
          />
          <div className="ide-add-actions">
            <button className="ide-add-submit" onClick={handleAddIDE}>
              Add
            </button>
            <button
              className="ide-add-cancel"
              onClick={() => setShowAddForm(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(menu, document.body);
}