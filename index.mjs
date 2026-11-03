import { join } from "node:path";
import { readFileSync } from "node:fs";
import { createBridge, API } from "./src/bridge.mjs";
import { configDirectory, importMagpieKey, manualModelIDs } from "./src/paths.mjs";
import { DEFAULT_MODELS, discoverModels, readBalance } from "./src/models.mjs";
import { nativeCatalog, runtimeCost } from "./src/catalog.mjs";

export const PROVIDER_ID = "deepseek-files";
export const PROVIDER_IDS = [
  "deepseek-files",
  "deepseek-files-oto",
  "deepseek-files-me",
];

const icon = "data:image/svg+xml;base64," + readFileSync(new URL("./assets/deepseek.svg", import.meta.url)).toString("base64");

const PROVIDER_SPECS = [
  {
    id: "deepseek-files",
    name: "DeepSeek Files Bridge",
    keyLabel: "ONE",
    importFrom: "deepseek",
  },
  {
    id: "deepseek-files-oto",
    name: "DeepSeek Files OTO",
    keyLabel: "OTO",
    importFrom: "oto",
  },
  {
    id: "deepseek-files-me",
    name: "DeepSeek Files Me",
    keyLabel: "Me",
    importFrom: "deepseek-me",
  },
];

async function makeHooks(spec, input = {}) {
  // Magpie passes its real settings directory, including portable installations.
  const directory = process.env.MAGPIE_CONFIG_DIR
    || (input.magpie && typeof input.directory === "string" ? input.directory : configDirectory());
  let configuredModels = {};

  return {
    auth: {
      provider: spec.id,
      icon,
      async usage(getAuth) { return readBalance(getAuth); },
      methods: [
        {
          type: "api",
          label: `DeepSeek API key (${spec.keyLabel})`,
          placeholder: "sk-…",
        },
        {
          type: "oauth",
          label: `Import existing Magpie ${spec.keyLabel} API key`,
          async authorize() {
            const key = await importMagpieKey(directory, spec.importFrom);
            return {
              url: "",
              method: "auto",
              instructions: `Importing the existing ${spec.keyLabel} DeepSeek key locally. It will not be printed.`,
              callback: async () => ({ type: "success", key }),
            };
          },
        },
      ],
      async loader(getAuth) {
        const auth = await getAuth();
        if (auth?.type !== "api" || !auth.key) return {};
        return {
          baseURL: `${API}/v1`,
          apiKey: auth.key,
          fetch: createBridge({
            getAuth,
            cacheDir: process.env.DEEPSEEK_FILES_CACHE_DIR || join(directory, "deepseek-files-cache"),
          }),
        };
      },
    },

    provider: {
      id: spec.id,
      async models(provider, context) {
        const manual = Object.fromEntries(
          (await manualModelIDs(directory, spec.id)).map((id) => [id, {}]),
        );
        return discoverModels(provider, {
          ...context,
          catalog: await nativeCatalog(directory),
          manualModels: { ...manual, ...configuredModels },
        });
      },
    },

    async config(config) {
      const maker = await nativeCatalog(directory);
      const models = structuredClone(DEFAULT_MODELS);
      for (const [id, model] of Object.entries(models)) {
        if (runtimeCost(maker[id]?.cost)) model.cost = maker[id].cost;
      }
      config.provider ??= {};
      const previous = config.provider[spec.id] ?? {};
      configuredModels = previous.models ?? {};
      config.provider[spec.id] = {
        ...previous,
        name: spec.name,
        npm: "@ai-sdk/openai",
        api: `${API}/v1`,
        searches: true,
        models: { ...models, ...previous.models },
      };
    },
  };
}

export async function DeepSeekFilesPlugin(input = {}) {
  return makeHooks(PROVIDER_SPECS[0], input);
}

export async function DeepSeekFilesOtoPlugin(input = {}) {
  return makeHooks(PROVIDER_SPECS[1], input);
}

export async function DeepSeekFilesMePlugin(input = {}) {
  return makeHooks(PROVIDER_SPECS[2], input);
}
