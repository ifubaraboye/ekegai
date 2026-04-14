import { useCallback, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  useWorkflowStore,
  type AgentProvider,
  type AgentConfig,
} from "../store/workflowStore";

interface AgentConfigModalProps {
  nodeId: string;
  onClose: () => void;
}

const defaultModels: Record<AgentProvider, string[]> = {
  claude: [
    "claude-sonnet-4-20250514",
    "claude-3-5-sonnet-20241022",
    "claude-3-opus-20240229",
  ],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  ollama: ["llama3.1", "mistral", "codellama"],
};

export function AgentConfigModal({ nodeId, onClose }: AgentConfigModalProps) {
  const { nodes, updateNodeData } = useWorkflowStore();

  const node = useMemo(() => {
    return nodes.find((n) => n.id === nodeId);
  }, [nodes, nodeId]);

  const existingConfig = node?.data.agentConfig;

  const [provider, setProvider] = useState<AgentProvider>(
    existingConfig?.provider || "claude",
  );
  const [model, setModel] = useState(
    existingConfig?.model || defaultModels.claude[0],
  );
  const [apiKey, setApiKey] = useState(existingConfig?.apiKey || "");
  const [systemPrompt, setSystemPrompt] = useState(
    existingConfig?.systemPrompt || "",
  );

  const handleProviderChange = useCallback((newProvider: AgentProvider) => {
    setProvider(newProvider);
    setModel(defaultModels[newProvider][0]);
  }, []);

  const handleSave = useCallback(() => {
    if (!apiKey.trim()) {
      alert("Please enter an API key");
      return;
    }

    const config: AgentConfig = {
      provider,
      model,
      apiKey: apiKey.trim(),
      systemPrompt: systemPrompt.trim(),
    };

    updateNodeData(nodeId, {
      label: `${provider.toUpperCase()} - ${model}`,
      agentConfig: config,
    });
    onClose();
  }, [provider, model, apiKey, systemPrompt, updateNodeData, nodeId, onClose]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content">
        <div className="flex items-center justify-between mb-4">
          <h2 className="modal-title">Configure AI Agent</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1"
          >
            <X size={20} />
          </button>
        </div>

        <div className="form-group">
          <label className="form-label">Provider</label>
          <select
            className="form-select"
            value={provider}
            onChange={(e) =>
              handleProviderChange(e.target.value as AgentProvider)
            }
          >
            <option value="claude">Claude (Anthropic)</option>
            <option value="openai">OpenAI</option>
            <option value="ollama">Ollama (Local)</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Model</label>
          <select
            className="form-select"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            {defaultModels[provider].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">
            {provider === "ollama" ? "Ollama URL" : "API Key"}
          </label>
          {provider === "ollama" ? (
            <input
              type="text"
              className="form-input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="http://localhost:11434"
            />
          ) : (
            <input
              type="password"
              className="form-input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider === "claude" ? "sk-ant-..." : "sk-..."}
            />
          )}
        </div>

        <div className="form-group">
          <label className="form-label">System Prompt (optional)</label>
          <textarea
            className="form-textarea"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="You are a helpful assistant..."
          />
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
