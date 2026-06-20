import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installLaylaMock } from "@layla-network/sdk";
import {
  MOCK_LAYLA_CHARACTERS,
  MOCK_LAYLA_MEMORIES,
  MOCK_LAYLA_PERSONAS,
  MOCK_LAYLA_SCHEDULED_CHAT_MESSAGES,
} from "./mockLaylaCharacters";
import { createOpenAIChatMockSource } from "./openaiChatMockSource";

if (import.meta.env.DEV) {
  installLaylaMock({
    characters: MOCK_LAYLA_CHARACTERS,
    memories: MOCK_LAYLA_MEMORIES,
    personas: MOCK_LAYLA_PERSONAS,
    scheduledChatMessages: MOCK_LAYLA_SCHEDULED_CHAT_MESSAGES,
    respond: createOpenAIChatMockSource({
      endpoint: import.meta.env.VITE_LAYLA_OPENAI_MOCK_ENDPOINT,
      model: import.meta.env.VITE_LAYLA_OPENAI_MOCK_MODEL,
      apiKey: import.meta.env.VITE_LAYLA_OPENAI_MOCK_API_KEY,
      temperature: 0.7,
    }),
    latencyMs: 100,
    tokenDelayMs: 0,
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
