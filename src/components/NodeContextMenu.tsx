import { useEffect, useRef, useCallback } from "react";
import { Play, Terminal, Settings, Trash2 } from "lucide-react";

interface NodeContextMenuProps {
  position: { x: number; y: number };
  onAction: (action: string) => void;
  onClose: () => void;
}

export function NodeContextMenu({
  position,
  onAction,
  onClose,
}: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [handleClickOutside]);

  // Adjust position to stay within viewport
  const adjustedPosition = { ...position };
  if (position.x + 200 > window.innerWidth) {
    adjustedPosition.x = window.innerWidth - 210;
  }
  if (position.y + 200 > window.innerHeight) {
    adjustedPosition.y = window.innerHeight - 210;
  }

  const menuItems = [
    { action: "run", icon: Play, label: "Run Agent", danger: false },
    {
      action: "terminal",
      icon: Terminal,
      label: "Open Terminal",
      danger: false,
    },
    {
      action: "configure",
      icon: Settings,
      label: "Configure LLM",
      danger: false,
    },
    { action: "delete", icon: Trash2, label: "Delete Node", danger: true },
  ];

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
    >
      {menuItems.map(({ action, icon: Icon, label, danger }) => (
        <div
          key={action}
          className={`context-menu-item ${danger ? "danger" : ""}`}
          onClick={() => onAction(action)}
        >
          <Icon size={16} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
