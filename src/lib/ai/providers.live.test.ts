import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AnthropicProvider } from "./providers/anthropic";
import { LocalProvider } from "./providers/local";
import { OpenAICompatibleProvider } from "./providers/openai-compatible";
import type { AIProvider } from "./provider";

// Checks against real models, skipped unless asked for:
//
//   docker compose up -d ollama   # with qwen2.5:3b pulled (see compose.yml)
//   AI_LIVE=ollama docker/bin/npx vitest run src/lib/ai/providers.live.test.ts
//   AI_LIVE=anthropic ANTHROPIC_TEST_KEY=… docker/bin/npx vitest run src/lib/ai/providers.live.test.ts
//
// AI_LIVE takes a comma-separated list. OLLAMA_URL and OLLAMA_MODEL override
// the defaults below.

const live = new Set((process.env.AI_LIVE ?? "").split(",").map((name) => name.trim()));
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://ollama:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:3b";

const Posting = z.object({
  company: z.string(),
  role: z.string(),
  city: z.string(),
});
const posting = "Ledgerly is hiring a Senior Product Designer for its payments team in Amsterdam.";

function checks(name: string, make: () => AIProvider, model: string) {
  // The first call may have to load the model into memory.
  describe(name, { timeout: 300_000 }, () => {
    it("answers a prompt and a connection test", async () => {
      const provider = make();
      const text = await provider.complete({
        system: "Answer in one short sentence.",
        messages: [{ role: "user", content: "What colour is the sky on a clear day?" }],
        creativity: "FAITHFUL",
      });
      expect(text.toLowerCase()).toContain("blue");
      expect(await provider.test()).toMatchObject({ model, latencyMs: expect.any(Number) });
    });

    it("returns JSON that matches a schema", async () => {
      const result = await make().complete({
        system: "Extract the job details from the posting.",
        messages: [{ role: "user", content: posting }],
        schema: Posting,
        schemaName: "posting",
      });
      expect(result).toMatchObject({ company: "Ledgerly", city: "Amsterdam" });
      expect(result.role).toMatch(/product designer/i);
    });

    it("lists its models", async () => {
      expect(await make().listModels()).toContain(model);
    });
  });
}

describe.runIf(live.has("ollama"))("live: Ollama", () => {
  checks("native API", () => new LocalProvider(OLLAMA_URL, OLLAMA_MODEL, 300_000), OLLAMA_MODEL);
  checks("OpenAI-compatible /v1", () => new OpenAICompatibleProvider("OPENAI", `${OLLAMA_URL}/v1`, null, OLLAMA_MODEL, 300_000), OLLAMA_MODEL);

  it("names a model that isn't installed", async () => {
    await expect(new LocalProvider(OLLAMA_URL, "no-such-model:1b", 60_000).test()).rejects.toMatchObject({ kind: "model" });
  });
});

describe.runIf(live.has("anthropic") && Boolean(process.env.ANTHROPIC_TEST_KEY))("live: Anthropic", () => {
  const model = process.env.ANTHROPIC_TEST_MODEL ?? "claude-haiku-4-5";
  checks("Messages API", () => new AnthropicProvider("https://api.anthropic.com", process.env.ANTHROPIC_TEST_KEY!, model, 120_000), model);

  it("refuses a wrong key in plain words", async () => {
    await expect(new AnthropicProvider("https://api.anthropic.com", "sk-ant-wrong", model, 60_000).test()).rejects.toMatchObject({ kind: "auth" });
  });
});
