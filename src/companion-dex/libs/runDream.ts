import type LaylaSDK from "@layla-network/sdk";
import type { LaylaScheduledChatMessage } from "@layla-network/sdk";
import type { Character } from "../types";
import {
  continueConversation,
  scheduleOutOfBlueMessage,
  selectRandomDreamCandidate,
  type ContinueConversationResult,
  type OutOfBlueMessageResult,
} from "./dream";
import type { ResolvedDreamPrompts } from "./dream-prompts";

export type RunDreamResult =
  | ContinueConversationResult
  | OutOfBlueMessageResult;

export interface RunDreamOptions<TBeforeDream = void> {
  layla: LaylaSDK;
  character: Character;
  scheduledMessages: LaylaScheduledChatMessage[];
  prompts: ResolvedDreamPrompts;
  beforeDream?: () => Promise<TBeforeDream>;
  signal?: AbortSignal;
  now?: number;
  random?: () => number;
  delayHours?: number;
}

export interface RunDreamWorkflowResult<TBeforeDream> {
  dream: RunDreamResult;
  beforeDreamResult: TBeforeDream | undefined;
}

export async function runDream<TBeforeDream = void>({
  layla,
  character,
  scheduledMessages,
  prompts,
  beforeDream,
  signal,
  now,
  random,
  delayHours,
}: RunDreamOptions<TBeforeDream>): Promise<RunDreamWorkflowResult<TBeforeDream>> {
  const beforeDreamResult = await beforeDream?.();
  const selectedDream = selectRandomDreamCandidate(
    character.chatHistory,
    scheduledMessages,
    character.id,
    random,
  );
  const commonOptions = {
    layla,
    signal,
    now,
    random,
    delayHours,
  };
  const dream =
    selectedDream.kind === "continue"
      ? await continueConversation(selectedDream.messages, character, {
          ...commonOptions,
          dreamSystemPrompt: prompts.dreamSystemPrompt,
        })
      : await scheduleOutOfBlueMessage(character, {
          ...commonOptions,
          outOfBlueSystemPrompt: prompts.outOfBlueSystemPrompt,
        });

  return { dream, beforeDreamResult };
}
