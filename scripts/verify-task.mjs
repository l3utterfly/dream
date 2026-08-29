import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const taskSource = await readFile(new URL("../dist/task.js", import.meta.url), "utf8");

assert.doesNotMatch(taskSource, /(?:^|\n)\s*(?:import|export)\s/m);
assert.doesNotMatch(taskSource, /\brequire\s*\(/);
assert.doesNotMatch(taskSource, /@layla-network\/sdk/);
assert.doesNotMatch(taskSource, /\b(?:setTimeout|setInterval|fetch)\s*\(/);

const character = {
  id: "aria",
  data: {
    data: {
      name: "Aria",
      description: "A thoughtful friend.",
      personality: "warm",
      scenario: "chatting",
      first_mes: "Hello.",
      mes_example: "",
      system_prompt: "",
      post_history_instructions: "",
      extensions: {},
    },
  },
};

function settingsDataUri(dreamPrompts) {
  const settings = {
    characters: {
      [character.id]: { dreamPrompts },
    },
  };
  return `data:application/json;base64,${Buffer.from(
    JSON.stringify(settings),
    "utf8",
  ).toString("base64")}`;
}

async function executeTask({
  dreamPrompts,
  scheduledMessages,
  sessions,
  history,
  memories,
}) {
  const completionRequests = [];
  const scheduledPayloads = [];
  const updatedCharacters = [];
  let completionIndex = 0;
  const layla = {
    characters: {
      list: async (offset) => (offset === 0 ? [character] : []),
      update: async (nextCharacter) => {
        updatedCharacters.push(nextCharacter);
        return nextCharacter.id;
      },
    },
    chat: {
      getScheduledChatMessages: async () => scheduledMessages,
      getChatSessions: async () => ({ sessions }),
      getChatHistory: async () => history,
      completions: {
        create: async (request) => {
          completionRequests.push(request);
          completionIndex += 1;
          return {
            choices: [
              {
                message: {
                  content:
                    completionIndex === 1 && memories.length > 0
                      ? "Fresh impression."
                      : "A scheduled thought.",
                },
              },
            ],
          };
        },
      },
      scheduleChatMessage: async (message) => {
        const scheduled = { ...message, id: scheduledPayloads.length + 1 };
        scheduledPayloads.push(scheduled);
        return scheduled;
      },
    },
    personas: {
      get: async () => ({ name: "Alex", description: "Likes concise notes." }),
    },
    memories: {
      list: async () => memories,
    },
    utils: {
      readFile: async () => ({ content_base64: settingsDataUri(dreamPrompts) }),
      saveFile: async () => ({ success: true }),
    },
  };

  const completion = vm.runInNewContext(taskSource, { layla, console });
  const result = await Promise.resolve(completion);
  return { result, completionRequests, scheduledPayloads, updatedCharacters };
}

const continuation = await executeTask({
  dreamPrompts: {
    dreamSystemPrompt: "CONTINUE {{char}} FOR {{user}}",
    outOfBlueSystemPrompt: "OUT OF BLUE {{char}}",
    readOnYouSystemPrompt: "REFLECT SYSTEM {{char}} / {{user}}",
    readOnYouUserInstruction: "REFLECT USER {{recent_memory}}",
  },
  scheduledMessages: [
    {
      id: 1,
      character_id: character.id,
      session_id: null,
      timestamp: Date.now(),
      message: "Already scheduled.",
    },
  ],
  sessions: [{ session_id: "session-1" }],
  history: [
    {
      id: 1,
      role: "assistant",
      name: "Aria",
      content: "Talk soon.",
      character_id: character.id,
      session_id: "session-1",
      timestamp: Date.now() - 1_000,
    },
  ],
  memories: [
    {
      id: 1,
      character_id: character.id,
      session_id: "session-1",
      rawText: "Alex remembered the small detail.",
      summary: "Alex notices small details.",
      timestamp: Date.now() - 2_000,
      knowledgeGraphJSON: null,
    },
  ],
});

assert.equal(continuation.result.kind, "continue");
assert.equal(continuation.result.reflected, true);
assert.equal(continuation.completionRequests.length, 2);
assert.equal(
  continuation.completionRequests[0].messages[0].content,
  "REFLECT SYSTEM Aria / Alex",
);
assert.equal(
  continuation.completionRequests[0].messages[1].content,
  "REFLECT USER Alex notices small details.",
);
assert.equal(
  continuation.completionRequests[1].messages[0].content,
  "CONTINUE Aria FOR Alex",
);
assert.equal(continuation.scheduledPayloads[0].session_id, "session-1");
assert.equal(continuation.updatedCharacters.length, 1);

const outOfBlue = await executeTask({
  dreamPrompts: {
    dreamSystemPrompt: "CONTINUE {{char}}",
    outOfBlueSystemPrompt: "OUT OF BLUE {{char}} FOR {{user}}",
    readOnYouSystemPrompt: "REFLECT SYSTEM",
    readOnYouUserInstruction: "REFLECT USER",
  },
  scheduledMessages: [],
  sessions: [],
  history: [],
  memories: [],
});

assert.equal(outOfBlue.result.kind, "out_of_blue");
assert.equal(outOfBlue.result.reflected, false);
assert.equal(outOfBlue.completionRequests.length, 1);
assert.equal(
  outOfBlue.completionRequests[0].messages[0].content,
  "OUT OF BLUE Aria FOR Alex",
);
assert.equal(outOfBlue.scheduledPayloads[0].session_id, null);

console.info("Generated task parity checks passed.");
