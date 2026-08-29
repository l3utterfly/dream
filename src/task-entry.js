import { dreamSelectionCandidates } from "./companion-dex/libs/dream";
import {
  dreamPromptOverridesForCharacter,
  resolveDreamPrompts,
} from "./companion-dex/libs/dream-prompts";
import { runDream } from "./companion-dex/libs/runDream";


// Dream background task source.
//
// The Layla host runs this file as a classic script in an isolated QuickJS
// runtime. The SDK is already available as the global `layla` instance, so this
// the generated dist/task.js has no imports and ends with a promise expression
// used as the task result.

const DREAM_TASK_CHARACTER_PAGE_SIZE = 20;
const DREAM_TASK_CHAT_HISTORY_LIMIT = 50;
const DREAM_TASK_MEMORY_LIMIT = 50;
const DREAM_TASK_DAY_MS = 24 * 60 * 60 * 1000;
const DREAM_TASK_SETTINGS_FILENAME = "settings.json";

function dreamTaskClean(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function dreamTaskShortText(value, maxLength) {
  const clean = dreamTaskClean(value);
  return clean.length > maxLength
    ? `${clean.slice(0, maxLength - 1).trim()}...`
    : clean;
}

function dreamTaskTimestampMs(timestamp) {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return 0;
  return Math.abs(timestamp) < 1000000000000 ? timestamp * 1000 : timestamp;
}

function dreamTaskRandomIndex(length) {
  return Math.min(length - 1, Math.max(0, Math.floor(Math.random() * length)));
}

function dreamTaskShuffle(values) {
  const shuffled = values.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = dreamTaskRandomIndex(index + 1);
    const value = shuffled[index];
    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = value;
  }
  return shuffled;
}

function dreamTaskRender(template, values) {
  return template.replace(/\{\{([^}]+)\}\}/g, function (_match, key) {
    return values[key.trim()] || "";
  });
}

function dreamTaskHumaniseDuration(seconds) {
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
  return `${Math.floor(seconds / 86400)} days`;
}

function dreamTaskCharacterName(character) {
  return dreamTaskClean(character.data.data.name) || "Layla Character";
}

function dreamTaskPersonaText(persona) {
  const name = dreamTaskClean(persona && persona.name);
  const description = dreamTaskClean(persona && persona.description);
  if (name && description) return `Name: ${name}\nDescription: ${description}`;
  if (description) return description;
  if (name) return `Name: ${name}`;
  return "No persona information available yet.";
}

function dreamTaskVitalValue(settings, characterId, key, now) {
  const wellbeing =
    settings.characters &&
    settings.characters[characterId] &&
    settings.characters[characterId].howYouAreDoing;
  const vital = wellbeing && wellbeing[key];
  if (!vital || typeof vital.value !== "number" || !Number.isFinite(vital.value)) {
    return 0;
  }
  if (typeof vital.lastTapped !== "number" || !Number.isFinite(vital.lastTapped)) {
    return Math.max(0, vital.value);
  }
  const elapsedDays = Math.max(0, now - vital.lastTapped) / DREAM_TASK_DAY_MS;
  return Math.max(0, vital.value * Math.pow(0.5, elapsedDays));
}

function dreamTaskEmotions(settings, characterId, now) {
  const energy = dreamTaskVitalValue(settings, characterId, "energy", now);
  const fed = dreamTaskVitalValue(settings, characterId, "hungriness", now);
  const social = dreamTaskVitalValue(settings, characterId, "social", now);

  const energyLabel = energy < 30 ? "Sleepy" : energy > 70 ? "Energetic" : "Bored";
  const fedLabel = fed < 30 ? "Hungry" : fed > 70 ? "Fed" : "Peckish";
  const socialLabel = social < 30 ? "Lonely" : social > 70 ? "Warm" : "Content";
  return `${energyLabel}, ${fedLabel}, ${socialLabel}`;
}

function dreamTaskVitals(settings, characterId, now) {
  return {
    energy: dreamTaskVitalValue(settings, characterId, "energy", now),
    fed: dreamTaskVitalValue(settings, characterId, "hungriness", now),
    social: dreamTaskVitalValue(settings, characterId, "social", now),
  };
}

function dreamTaskCardImpression(character) {
  const data = character.data.data;
  const stored = dreamTaskClean(data.extensions && data.extensions.impression);
  if (stored) return stored;
  const name = dreamTaskCharacterName(character);
  const description = dreamTaskShortText(data.description, 96);
  return `${name}'s card suggests ${description || `${name} is ready to chat.`}`;
}

function dreamTaskToCharacter(context, settings, now) {
  const data = context.character.data.data;
  const greeting = dreamTaskShortText(
    data.first_mes || `Hi, I'm ${context.name}.`,
    120,
  );
  const description = dreamTaskShortText(
    data.description || `${context.name} is ready to chat.`,
    120,
  );

  return {
    id: context.character.id,
    laylaCharacter: context.character,
    persona: context.persona || undefined,
    name: context.name,
    chatHistory: context.history,
    vitals: dreamTaskVitals(settings, context.character.id, now),
    moments: [
      {
        quote: greeting,
        context: "opening message from their character card",
        when: "today",
      },
      {
        quote: description,
        context: "how their card introduces them",
        when: "now",
      },
    ],
    impression: dreamTaskCardImpression(context.character),
  };
}

async function dreamTaskListCharacters() {
  const characters = [];
  let offset = 0;
  while (true) {
    const page = await layla.characters.list(
      offset,
      DREAM_TASK_CHARACTER_PAGE_SIZE,
    );
    characters.push.apply(characters, page);
    if (page.length < DREAM_TASK_CHARACTER_PAGE_SIZE) return characters;
    offset += page.length;
  }
}

async function dreamTaskLoadHistory(characterId) {
  const sessionResult = await layla.chat.getChatSessions(
    characterId,
    0,
    DREAM_TASK_CHAT_HISTORY_LIMIT,
  );
  const history = [];
  for (const session of sessionResult.sessions) {
    const remaining = DREAM_TASK_CHAT_HISTORY_LIMIT - history.length;
    if (remaining <= 0) break;
    const sessionHistory = await layla.chat.getChatHistory(
      session.session_id,
      0,
      remaining,
    );
    history.push.apply(history, sessionHistory);
  }
  return history;
}

function dreamTaskBase64Bytes(value) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = value.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  const bytes = [];
  let bits = 0;
  let bitCount = 0;
  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    if (char === "=") break;
    const digit = alphabet.indexOf(char);
    if (digit < 0) continue;
    bits = bits * 64 + digit;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes.push(Math.floor(bits / Math.pow(2, bitCount)) & 255);
      bits %= Math.pow(2, bitCount);
    }
  }
  return bytes;
}

function dreamTaskUtf8Decode(bytes) {
  let result = "";
  for (let index = 0; index < bytes.length; index += 1) {
    const first = bytes[index];
    if (first < 128) {
      result += String.fromCharCode(first);
    } else if (first < 224) {
      const second = bytes[++index];
      result += String.fromCharCode(((first & 31) << 6) | (second & 63));
    } else if (first < 240) {
      const second = bytes[++index];
      const third = bytes[++index];
      result += String.fromCharCode(
        ((first & 15) << 12) | ((second & 63) << 6) | (third & 63),
      );
    } else {
      const second = bytes[++index];
      const third = bytes[++index];
      const fourth = bytes[++index];
      let point =
        ((first & 7) << 18) |
        ((second & 63) << 12) |
        ((third & 63) << 6) |
        (fourth & 63);
      point -= 65536;
      result += String.fromCharCode(55296 + (point >> 10), 56320 + (point & 1023));
    }
  }
  return result;
}

function dreamTaskUtf8Encode(value) {
  const bytes = [];
  for (let index = 0; index < value.length; index += 1) {
    let point = value.charCodeAt(index);
    if (point >= 55296 && point <= 56319 && index + 1 < value.length) {
      const low = value.charCodeAt(index + 1);
      if (low >= 56320 && low <= 57343) {
        point = 65536 + ((point - 55296) << 10) + (low - 56320);
        index += 1;
      }
    }
    if (point < 128) {
      bytes.push(point);
    } else if (point < 2048) {
      bytes.push(192 | (point >> 6), 128 | (point & 63));
    } else if (point < 65536) {
      bytes.push(
        224 | (point >> 12),
        128 | ((point >> 6) & 63),
        128 | (point & 63),
      );
    } else {
      bytes.push(
        240 | (point >> 18),
        128 | ((point >> 12) & 63),
        128 | ((point >> 6) & 63),
        128 | (point & 63),
      );
    }
  }
  return bytes;
}

function dreamTaskBase64Encode(bytes) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const hasSecond = index + 1 < bytes.length;
    const hasThird = index + 2 < bytes.length;
    const second = hasSecond ? bytes[index + 1] : 0;
    const third = hasThird ? bytes[index + 2] : 0;
    const value = (first << 16) | (second << 8) | third;
    result += alphabet[(value >> 18) & 63];
    result += alphabet[(value >> 12) & 63];
    result += hasSecond ? alphabet[(value >> 6) & 63] : "=";
    result += hasThird ? alphabet[value & 63] : "=";
  }
  return result;
}

async function dreamTaskLoadSettings() {
  try {
    const file = await layla.utils.readFile(DREAM_TASK_SETTINGS_FILENAME);
    if (!file.content_base64) return {};
    const parsed = JSON.parse(
      dreamTaskUtf8Decode(dreamTaskBase64Bytes(file.content_base64)),
    );
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.warn("Dream could not read settings.json; defaults will be used.", error);
    return {};
  }
}

async function dreamTaskSaveSettings(settings) {
  const content = dreamTaskBase64Encode(
    dreamTaskUtf8Encode(JSON.stringify(settings, null, 2)),
  );
  const result = await layla.utils.saveFile(
    DREAM_TASK_SETTINGS_FILENAME,
    content,
    false,
  );
  if (!result.success) {
    throw new Error(result.message || "Dream could not save settings.json.");
  }
}

function dreamTaskReflectionSettings(settings, characterId) {
  const characterSettings =
    settings.characters && settings.characters[characterId];
  return (characterSettings && characterSettings.reflection) || {};
}

function dreamTaskWithReflectionSettings(settings, characterId, reflection) {
  const characters = settings.characters || {};
  const characterSettings = characters[characterId] || {};
  return Object.assign({}, settings, {
    characters: Object.assign({}, characters, {
      [characterId]: Object.assign({}, characterSettings, { reflection }),
    }),
  });
}

function dreamTaskMemoryText(memory) {
  return dreamTaskClean(memory.summary || memory.rawText);
}

function dreamTaskLastSentence(value) {
  const clean = dreamTaskClean(value);
  const sentences = clean.match(/[^.!?。！？\n]+(?:[.!?。！？]+|$)/g) || [];
  return dreamTaskClean(sentences[sentences.length - 1] || clean);
}

function dreamTaskStage(history) {
  const timestamps = history
    .map(function (entry) {
      return dreamTaskTimestampMs(entry.timestamp);
    })
    .filter(Boolean)
    .sort(function (a, b) {
      return a - b;
    });
  if (timestamps.length === 0) return "occasionally chatting";
  const windowMs = Math.max(
    timestamps[timestamps.length - 1] - timestamps[0],
    DREAM_TASK_DAY_MS,
  );
  const messagesPerMs = timestamps.length / windowMs;
  if (messagesPerMs > 1 / DREAM_TASK_DAY_MS) return "always chatting";
  if (messagesPerMs > 1 / (3 * DREAM_TASK_DAY_MS)) return "frequently chatting";
  return "occasionally chatting";
}

function dreamTaskTimeTogether(history, now) {
  const timestamps = history
    .map(function (entry) {
      return dreamTaskTimestampMs(entry.timestamp);
    })
    .filter(Boolean);
  if (timestamps.length === 0) return dreamTaskHumaniseDuration(0);
  return dreamTaskHumaniseDuration(
    Math.max(0, now - Math.min.apply(Math, timestamps)) / 1000,
  );
}

async function dreamTaskMaybeReflect(context, settings, prompts, now) {
  let memories;
  try {
    memories = await layla.memories.list(
      context.character.id,
      0,
      DREAM_TASK_MEMORY_LIMIT,
    );
  } catch (error) {
    console.warn(
      `Dream could not load memories for ${context.name}; skipping reflection.`,
      error,
    );
    return { settings, reflected: false };
  }

  const memoryLines = memories.map(dreamTaskMemoryText).filter(Boolean);
  if (memoryLines.length === 0 || context.history.length === 0) {
    return { settings, reflected: false };
  }

  const memoriesValue = memoryLines
    .slice(0, 3)
    .map(function (memory) {
      return `- ${memory}`;
    })
    .join("\n");
  const recentMemory = dreamTaskLastSentence(memoryLines[0]) || "no recent chats";
  const previous = dreamTaskReflectionSettings(settings, context.character.id);
  const lastReflectedAt = previous.lastReflectedAt;
  const cooldownElapsed =
    typeof lastReflectedAt !== "number" ||
    now - lastReflectedAt > DREAM_TASK_DAY_MS;
  if (
    previous.memories === memoriesValue ||
    previous.recentMemory === recentMemory ||
    !cooldownElapsed
  ) {
    return { settings, reflected: false };
  }

  const data = context.character.data.data;
  const values = {
    user: context.userName,
    char: context.name,
    persona: dreamTaskPersonaText(context.persona),
    description: dreamTaskClean(data.description) || "No description available",
    personality:
      dreamTaskClean(data.personality) || "No personality description available",
    stage: dreamTaskStage(context.history),
    time_together: dreamTaskTimeTogether(context.history, now),
    warmth_and_depth: "You've had a nice mix of warm and thoughtful exchanges",
    previous_impression: dreamTaskCardImpression(context.character),
    memories: memoriesValue,
    emotions: context.emotions,
    recent_memory: recentMemory,
  };
  const completion = await layla.chat.completions.create({
    messages: [
      {
        role: "system",
        content: dreamTaskRender(
          prompts.readOnYouSystemPrompt,
          values,
        ),
      },
      {
        role: "user",
        content: dreamTaskRender(
          prompts.readOnYouUserInstruction,
          values,
        ),
      },
    ],
  });
  const impression = dreamTaskClean(
    completion.choices[0] && completion.choices[0].message.content,
  );
  if (!impression) {
    throw new Error("Dream reflection did not return an impression.");
  }

  const character = context.character;
  const nextCharacter = Object.assign({}, character, {
    data: Object.assign({}, character.data, {
      data: Object.assign({}, data, {
        extensions: Object.assign({}, data.extensions || {}, { impression }),
      }),
    }),
  });
  await layla.characters.update(nextCharacter);

  const nextSettings = dreamTaskWithReflectionSettings(
    settings,
    character.id,
    {
      lastReflectedAt: now,
      memories: memoriesValue,
      recentMemory,
    },
  );
  await dreamTaskSaveSettings(nextSettings);
  console.info(`Dream refreshed ${context.name}'s impression.`);
  return { settings: nextSettings, reflected: true };
}

console.info("Dream background task starting.");

(async function () {
  const now = Date.now();
  const settings = await dreamTaskLoadSettings();
  const scheduledMessages = await layla.chat.getScheduledChatMessages();
  const characters = dreamTaskShuffle(await dreamTaskListCharacters());
  if (characters.length === 0) {
    return { status: "idle", message: "Dream found no characters." };
  }

  let selected = null;
  const characterErrors = [];
  for (const character of characters) {
    try {
      const history = await dreamTaskLoadHistory(character.id);
      const candidates = dreamSelectionCandidates(
        history,
        scheduledMessages,
        character.id,
      );
      if (candidates.length === 0) continue;
      selected = {
        character,
        history,
      };
      break;
    } catch (error) {
      const name = dreamTaskCharacterName(character);
      const message = error && error.message ? error.message : String(error);
      characterErrors.push(`${name}: ${message}`);
      console.warn(`Dream skipped ${name}: ${message}`);
    }
  }

  if (!selected) {
    return {
      status: "idle",
      message: "Dream found no unscheduled conversation options.",
      skippedErrors: characterErrors,
    };
  }

  const character = selected.character;
  const name = dreamTaskCharacterName(character);
  let persona = null;
  try {
    persona = await layla.personas.get(character.id);
  } catch (error) {
    console.warn(`Dream could not load ${name}'s persona; using defaults.`, error);
  }
  const prompts = resolveDreamPrompts(
    dreamPromptOverridesForCharacter(settings, character.id),
  );
  const context = {
    character,
    history: selected.history,
    name,
    persona,
    userName: dreamTaskClean(persona && persona.name) || "user",
    emotions: dreamTaskEmotions(settings, character.id, now),
  };
  const taskCharacter = dreamTaskToCharacter(context, settings, now);
  const { dream: result, beforeDreamResult: reflection } = await runDream({
    layla,
    character: taskCharacter,
    scheduledMessages,
    prompts,
    now,
    beforeDream: () =>
      dreamTaskMaybeReflect(context, settings, prompts, now),
  });

  console.info(
    `Dream scheduled a ${result.kind} message from ${name} in ${result.delayHours} hours.`,
  );
  return {
    status: "scheduled",
    character: name,
    characterId: character.id,
    kind: result.kind,
    sessionId: result.scheduledMessage.session_id,
    scheduledAt: result.scheduledAt,
    delayHours: result.delayHours,
    reflected: reflection?.reflected ?? false,
    message: result.response,
  };
})();
