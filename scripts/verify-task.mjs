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

function settingsDataUri({ dreamPrompts, dream }) {
  const settings = {
    characters: {
      [character.id]: { dreamPrompts },
    },
    ...(dream ? { dream } : {}),
  };
  return `data:application/json;base64,${Buffer.from(
    JSON.stringify(settings),
    "utf8",
  ).toString("base64")}`;
}

async function executeTask({
  dreamPrompts,
  dream,
  scheduledMessages,
  sessions,
  history,
  memories,
  random = Math.random,
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
      readFile: async () => ({
        content_base64: settingsDataUri({ dreamPrompts, dream }),
      }),
      saveFile: async () => ({ success: true }),
    },
  };

  const sandboxMath = Object.create(Math);
  sandboxMath.random = random;
  const completion = vm.runInNewContext(taskSource, {
    layla,
    console,
    Math: sandboxMath,
  });
  const result = await Promise.resolve(completion);
  return { result, completionRequests, scheduledPayloads, updatedCharacters };
}

// An allowed character with an unscheduled session continues the conversation
// and reflects first. The scheduled delay stays within [1h, frequency max].
const continuation = await executeTask({
  dreamPrompts: {
    dreamSystemPrompt: "CONTINUE {{char}} FOR {{user}}",
    outOfBlueSystemPrompt: "OUT OF BLUE {{char}}",
    readOnYouSystemPrompt: "REFLECT SYSTEM {{char}} / {{user}}",
    readOnYouUserInstruction: "REFLECT USER {{recent_memory}}",
  },
  dream: { frequency: "three-days", characterIds: [character.id] },
  scheduledMessages: [],
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
  // Force the continuation candidate (listed before the out-of-blue option) and
  // the minimum (1 hour) scheduled delay.
  random: () => 0,
});

assert.equal(continuation.result.status, "scheduled");
assert.equal(continuation.result.scheduledCount, 1);
assert.equal(continuation.result.scheduled.length, 1);
assert.equal(continuation.result.scheduled[0].kind, "continue");
assert.equal(continuation.result.scheduled[0].reflected, true);
assert.equal(continuation.result.scheduled[0].delayHours, 1);
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

// An allowed character with no prior history sends an out-of-blue message. The
// nightly frequency caps the scheduled delay at 24 hours.
const outOfBlue = await executeTask({
  dreamPrompts: {
    dreamSystemPrompt: "CONTINUE {{char}}",
    outOfBlueSystemPrompt: "OUT OF BLUE {{char}} FOR {{user}}",
    readOnYouSystemPrompt: "REFLECT SYSTEM",
    readOnYouUserInstruction: "REFLECT USER",
  },
  dream: { frequency: "nightly", characterIds: [character.id] },
  scheduledMessages: [],
  sessions: [],
  history: [],
  memories: [],
});

assert.equal(outOfBlue.result.status, "scheduled");
assert.equal(outOfBlue.result.scheduled[0].kind, "out_of_blue");
assert.equal(outOfBlue.result.scheduled[0].reflected, false);
assert.ok(outOfBlue.result.scheduled[0].delayHours >= 1);
assert.ok(outOfBlue.result.scheduled[0].delayHours <= 24);
assert.equal(outOfBlue.completionRequests.length, 1);
assert.equal(
  outOfBlue.completionRequests[0].messages[0].content,
  "OUT OF BLUE Aria FOR Alex",
);
assert.equal(outOfBlue.scheduledPayloads[0].session_id, null);

// When the character already has a scheduled (still unread) message, dreaming
// is a no-op: nothing new is scheduled and no completions are requested.
const alreadyScheduled = await executeTask({
  dreamPrompts: {
    dreamSystemPrompt: "CONTINUE {{char}}",
    outOfBlueSystemPrompt: "OUT OF BLUE {{char}}",
    readOnYouSystemPrompt: "REFLECT SYSTEM",
    readOnYouUserInstruction: "REFLECT USER",
  },
  dream: { frequency: "three-days", characterIds: [character.id] },
  scheduledMessages: [
    {
      id: 1,
      character_id: character.id,
      session_id: "session-1",
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
  memories: [],
});

assert.equal(alreadyScheduled.result.status, "idle");
assert.equal(alreadyScheduled.scheduledPayloads.length, 0);
assert.equal(alreadyScheduled.completionRequests.length, 0);

// A character that is not in the allowed list never dreams, even with an
// unscheduled session available.
const notAllowed = await executeTask({
  dreamPrompts: {
    dreamSystemPrompt: "CONTINUE {{char}}",
    outOfBlueSystemPrompt: "OUT OF BLUE {{char}}",
    readOnYouSystemPrompt: "REFLECT SYSTEM",
    readOnYouUserInstruction: "REFLECT USER",
  },
  dream: { frequency: "three-days", characterIds: ["someone-else"] },
  scheduledMessages: [],
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
  memories: [],
});

assert.equal(notAllowed.result.status, "idle");
assert.equal(notAllowed.scheduledPayloads.length, 0);
assert.equal(notAllowed.completionRequests.length, 0);

// Without any dream automation settings, nothing is scheduled.
const noAutomation = await executeTask({
  dreamPrompts: {
    dreamSystemPrompt: "CONTINUE {{char}}",
    outOfBlueSystemPrompt: "OUT OF BLUE {{char}}",
    readOnYouSystemPrompt: "REFLECT SYSTEM",
    readOnYouUserInstruction: "REFLECT USER",
  },
  dream: undefined,
  scheduledMessages: [],
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
  memories: [],
});

assert.equal(noAutomation.result.status, "idle");
assert.equal(noAutomation.scheduledPayloads.length, 0);
assert.equal(noAutomation.completionRequests.length, 0);

console.info("Generated task parity checks passed.");
