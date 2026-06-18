import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installLaylaMock } from "@layla-network/sdk";
import { MOCK_LAYLA_CHARACTERS } from "./mockLaylaCharacters";

if (import.meta.env.DEV) {
  installLaylaMock({
    characters: MOCK_LAYLA_CHARACTERS,
    respond: (messages) =>
      `You said: ${messages.at(-1)?.content}. Mock response from Layla.`,
    latencyMs: 1000,
    tokenDelayMs: 300,
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
