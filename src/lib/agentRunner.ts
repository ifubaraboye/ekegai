import Anthropic from "@anthropic-ai/sdk";

interface AgentConfig {
  provider: "claude" | "openai" | "ollama";
  model: string;
  apiKey: string;
  systemPrompt: string;
}

type OutputCallback = (data: string) => void;

export async function runAgent(
  ptyId: string,
  config: AgentConfig,
  inputData: string,
  outputCallback: OutputCallback,
): Promise<void> {
  const prefix = "\r\n[Agent] ";

  switch (config.provider) {
    case "claude":
      await runClaude(config, inputData, outputCallback, prefix);
      break;
    case "openai":
      await runOpenAI(config, inputData, outputCallback, prefix);
      break;
    case "ollama":
      await runOllama(config, inputData, outputCallback, prefix);
      break;
    default:
      outputCallback(`${prefix}Unknown provider: ${config.provider}\r\n`);
  }
}

async function runClaude(
  config: AgentConfig,
  inputData: string,
  outputCallback: OutputCallback,
  prefix: string,
): Promise<void> {
  const client = new Anthropic({
    apiKey: config.apiKey,
    maxTokensMaxIterations: 4096,
  });

  outputCallback(`${prefix}Starting Claude ${config.model}...\r\n`);

  try {
    const stream = await client.messages.stream({
      model: config.model,
      max_tokens: 4096,
      system: config.systemPrompt || undefined,
      messages: [
        ...(config.systemPrompt ? [] : []),
        {
          role: "user",
          content: inputData || "Hello",
        },
      ],
    });

    for await (const chunk of stream) {
      if (
        chunk.type === "content_block_delta" &&
        chunk.delta.type === "text_delta"
      ) {
        const text = chunk.delta.text;
        outputCallback(text);
      }
    }

    outputCallback(`\r\n${prefix}Done.\r\n`);
  } catch (error) {
    outputCallback(
      `${prefix}Error: ${error instanceof Error ? error.message : "Unknown error"}\r\n`,
    );
  }
}

async function runOpenAI(
  config: AgentConfig,
  inputData: string,
  outputCallback: OutputCallback,
  prefix: string,
): Promise<void> {
  outputCallback(`${prefix}Starting OpenAI ${config.model}...\r\n`);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          ...(config.systemPrompt
            ? [{ role: "system" as const, content: config.systemPrompt }]
            : []),
          { role: "user" as const, content: inputData || "Hello" },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      outputCallback(`${prefix}API Error: ${response.status} ${errorText}\r\n`);
      return;
    }

    if (!response.body) {
      outputCallback(`${prefix}No response body\r\n`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((line) => line.trim() !== "");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              outputCallback(content);
            }
          } catch {
            // Skip parse errors for incomplete chunks
          }
        }
      }
    }

    outputCallback(`\r\n${prefix}Done.\r\n`);
  } catch (error) {
    outputCallback(
      `${prefix}Error: ${error instanceof Error ? error.message : "Unknown error"}\r\n`,
    );
  }
}

async function runOllama(
  config: AgentConfig,
  inputData: string,
  outputCallback: OutputCallback,
  prefix: string,
): Promise<void> {
  outputCallback(`${prefix}Starting Ollama ${config.model}...\r\n`);

  const baseUrl = config.apiKey || "http://localhost:11434";

  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        prompt: inputData || "Hello",
        system: config.systemPrompt || undefined,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      outputCallback(`${prefix}API Error: ${response.status} ${errorText}\r\n`);
      return;
    }

    if (!response.body) {
      outputCallback(`${prefix}No response body\r\n`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((line) => line.trim() !== "");

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          const content = parsed.response;
          if (content) {
            outputCallback(content);
          }
        } catch {
          // Skip parse errors
        }
      }
    }

    outputCallback(`\r\n${prefix}Done.\r\n`);
  } catch (error) {
    outputCallback(
      `${prefix}Error: ${error instanceof Error ? error.message : "Unknown error"}\r\n`,
    );
  }
}
