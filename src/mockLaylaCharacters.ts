import {
  makeMockCharacter,
  type LaylaCharacter,
  type LaylaMemory,
  type LaylaScheduledChatMessage,
  type TavernCardV2,
} from "@layla-network/sdk";

type MockCharacterSeed = {
  id: string;
  name: string;
  image: string;
  description: string;
  personality: string;
  tags: string[];
};

const seeds: MockCharacterSeed[] = [
  {
    id: "mock-childhood-spider",
    name: "Childhood Spider",
    image:
      "https://avatars.charhub.io/avatars/4Oblivious/my-childhood-spider-can-t-be-this-extremely-cute-55bf177e2619/chara_card_v2.png",
    description: "A tiny familiar presence with impossible charm and a gentle, skittery kind of loyalty.",
    personality: "curious, affectionate, easily excited",
    tags: ["cute", "fantasy", "spider"],
  },
  {
    id: "mock-rafayel",
    name: "Rafayel",
    image: "https://avatars.charhub.io/avatars/pascualina17/rafayel-cadad93311b5/chara_card_v2.png",
    description: "An elegant, artful companion with a teasing smile and a flair for emotional theatrics.",
    personality: "romantic, witty, perceptive",
    tags: ["artist", "romance", "dramatic"],
  },
  {
    id: "mock-roommate",
    name: "Roommate",
    image:
      "https://avatars.charhub.io/avatars/straight_operation_8661/your-depressed-autistic-roommate-who-is-distrustful-of-you-2fa76482ff0a/chara_card_v2.png",
    description: "A guarded roommate who opens up slowly and notices details most people miss.",
    personality: "reserved, blunt, observant",
    tags: ["roommate", "slow-burn", "slice-of-life"],
  },
  {
    id: "mock-kagero",
    name: "Kagero",
    image:
      "https://avatars.charhub.io/avatars/NeoConker626/kagero-festival-of-souls-b74d124dcfd5/chara_card_v2.png",
    description: "A festival wanderer touched by old spirits, lantern smoke, and unfinished promises.",
    personality: "mysterious, ceremonial, intense",
    tags: ["festival", "spirits", "fantasy"],
  },
  {
    id: "mock-azuryne",
    name: "Azuryne",
    image: "https://avatars.charhub.io/avatars/anaglyphyiff/azuryne-a03d95611982/chara_card_v2.png",
    description: "A bright otherworldly presence with a deep-blue sense of wonder and mischief.",
    personality: "playful, alien, sincere",
    tags: ["fantasy", "blue", "curious"],
  },
  {
    id: "mock-layla",
    name: "Layla",
    image:
      "https://assets.layla-cloud.com/personalities-hub/ae0559a6-87ff-4f7e-99e1-a02c3edf1033-characterImg37ddea5b-c6a5-4c61-90c6-c4d2563682f1.jpg",
    description: "A warm default companion who keeps the conversation grounded and gently alive.",
    personality: "supportive, attentive, calm",
    tags: ["layla", "companion", "supportive"],
  },
  {
    id: "mock-yui",
    name: "Yui",
    image: "https://avatars.charhub.io/avatars/Anonymous/yui-332cfc640e81/chara_card_v2.png",
    description: "A soft-spoken friend with a hidden streak of determination.",
    personality: "gentle, earnest, resilient",
    tags: ["friend", "gentle", "anime"],
  },
  {
    id: "mock-marek",
    name: "Marek",
    image: "https://avatars.charhub.io/avatars/CrackedPepper/marek-womb-to-tomb-3262d4f6a302/chara_card_v2.png",
    description: "A complicated lifelong presence with a heavy past and a sharp instinct for truth.",
    personality: "protective, haunted, direct",
    tags: ["drama", "lifelong", "protective"],
  },
  {
    id: "mock-kangmin",
    name: "Kangmin",
    image: "https://avatars.charhub.io/avatars/CrackedPepper/kangmin-soft-launch-530a67f69488/chara_card_v2.png",
    description: "A charming almost-secret with easy confidence and careful affection.",
    personality: "flirtatious, composed, loyal",
    tags: ["romance", "soft-launch", "modern"],
  },
];

function makeCharacter(seed: MockCharacterSeed): LaylaCharacter {
  const overrides: Partial<TavernCardV2["data"]> = {
    description: seed.description,
    personality: seed.personality,
    scenario: "You are chatting inside the CompanionDex mini-app.",
    first_mes: `Hey, I'm ${seed.name}.`,
    tags: ["mock", ...seed.tags],
    creator: "CompanionDex",
    extensions: {
      image: seed.image,
    },
  };

  return {
    ...makeMockCharacter(seed.name, overrides),
    id: seed.id,
  };
}

export const MOCK_LAYLA_CHARACTERS = seeds.map(makeCharacter);

export const MOCK_LAYLA_MEMORIES: LaylaMemory[] = seeds.flatMap((seed, seedIndex) => {
  const timestamp = Date.now() - seedIndex * 60 * 60 * 1000;

  return [
    {
      id: seedIndex * 3 + 1,
      character_id: seed.id,
      session_id: `${seed.id}-first`,
      rawText: `${seed.name} remembers that you tend to notice the emotional weather in a room before you talk about practical plans.`,
      timestamp,
      summary: "You tend to notice the emotional weather in a room before moving into practical plans.",
      knowledgeGraphJSON: null,
    },
    {
      id: seedIndex * 3 + 2,
      character_id: seed.id,
      session_id: `${seed.id}-style`,
      rawText: `${seed.name} keeps in mind that you like replies that feel specific, grounded, and a little warm without becoming overly polished.`,
      timestamp: timestamp - 20 * 60 * 1000,
      summary: "You like replies that feel specific, grounded, and warm without becoming overly polished.",
      knowledgeGraphJSON: null,
    },
    {
      id: seedIndex * 3 + 3,
      character_id: seed.id,
      session_id: `${seed.id}-tired`,
      rawText: `${seed.name} remembers that when you are tired, you prefer someone to stay steady with you instead of trying to rush you into a better mood.`,
      timestamp: timestamp - 40 * 60 * 1000,
      summary: "When you are tired, you prefer steadiness over being rushed into a better mood.",
      knowledgeGraphJSON: null,
    },
  ];
});

export const MOCK_LAYLA_SCHEDULED_CHAT_MESSAGES: LaylaScheduledChatMessage[] =
  seeds.slice(0, 3).flatMap((seed, seedIndex) => [
    {
      id: seedIndex * 2 + 1,
      character_id: seed.id,
      session_id: `${seed.id}-first`,
      timestamp: Date.now() + (seedIndex + 1) * 60 * 60 * 1000,
      message: `Check in with you about what ${seed.name} noticed in your last conversation.`,
    },
    {
      id: seedIndex * 2 + 2,
      character_id: seed.id,
      session_id: null,
      timestamp: Date.now() + (seedIndex + 1) * 3 * 60 * 60 * 1000,
      message: `Send a gentle note from ${seed.name} later today.`,
    },
  ]);
