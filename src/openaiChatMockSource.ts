import type { LaylaChatMessage } from "@layla-network/sdk";

interface OpenAIChatMockSourceOptions {
  endpoint?: string;
  model?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

type OpenAIStreamDone = typeof OPENAI_STREAM_DONE;

const OPENAI_STREAM_DONE = Symbol("openai-stream-done");
const DEFAULT_ENDPOINT = "http://localhost:1234/v1/chat/completions";
const DEFAULT_MODEL = "local-model";

function optionalString(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function createOpenAIHeaders(apiKey: string | undefined) {
  return {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
}

function toOpenAIMessage(message: LaylaChatMessage) {
  return {
    role: message.role,
    content: message.content ?? "",
    ...(message.name ? { name: message.name } : {}),
  };
}

async function readErrorBody(response: Response) {
  try {
    const text = await response.text();
    return text.trim();
  } catch {
    return "";
  }
}

function readDeltaFromDataLine(line: string): string | OpenAIStreamDone | null {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith(":") || !trimmed.startsWith("data:")) {
    return null;
  }

  const data = trimmed.slice("data:".length).trim();
  if (data === "[DONE]") return OPENAI_STREAM_DONE;

  const parsed = JSON.parse(data) as {
    choices?: Array<{
      delta?: { content?: unknown };
      message?: { content?: unknown };
      text?: unknown;
    }>;
  };

  return (
    parsed.choices
      ?.map((choice) => {
        if (typeof choice.delta?.content === "string") {
          return choice.delta.content;
        }

        if (typeof choice.message?.content === "string") {
          return choice.message.content;
        }

        if (typeof choice.text === "string") {
          return choice.text;
        }

        return "";
      })
      .join("") ?? ""
  );
}

async function* streamOpenAIResponse(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let complete = false;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        buffer += decoder.decode();
        complete = true;
      } else {
        buffer += decoder.decode(value, { stream: true });
      }

      const lines = buffer.split(/\r?\n/);
      buffer = done ? "" : (lines.pop() ?? "");

      for (const line of lines) {
        const delta = readDeltaFromDataLine(line);
        if (delta === OPENAI_STREAM_DONE) return;
        if (delta) yield delta;
      }

      if (done) return;
    }
  } finally {
    if (!complete) {
      await reader.cancel().catch(() => undefined);
    }

    reader.releaseLock();
  }
}

export function createOpenAIChatMockSource({
  endpoint = DEFAULT_ENDPOINT,
  model = DEFAULT_MODEL,
  apiKey,
  temperature,
  maxTokens,
}: OpenAIChatMockSourceOptions = {}) {
  const resolvedEndpoint = optionalString(endpoint) ?? DEFAULT_ENDPOINT;
  const resolvedModel = optionalString(model) ?? DEFAULT_MODEL;
  const resolvedApiKey = optionalString(apiKey);

  return async function* openAIChatMockSource(messages: LaylaChatMessage[]) {
    const response = await fetch(resolvedEndpoint, {
      method: "POST",
      headers: createOpenAIHeaders(resolvedApiKey),
      body: JSON.stringify({
        model: resolvedModel,
        messages: messages.map(toOpenAIMessage),
        stream: true,
        ...(temperature === undefined ? {} : { temperature }),
        ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
      }),
    });

    console.log("mock OpenAI chat messages sent:", messages.map(toOpenAIMessage));

    if (!response.ok) {
      const body = await readErrorBody(response);
      throw new Error(
        `Local OpenAI chat API returned ${response.status}${
          body ? `: ${body}` : ""
        }`,
      );
    }

    if (!response.body) {
      throw new Error("Local OpenAI chat API did not return a stream.");
    }

    yield* streamOpenAIResponse(response.body);
  };
}
