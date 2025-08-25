import {
  MessageCreateParamsBase,
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";
import { get_encoding } from "tiktoken";
import { log } from "./log";
import { sessionUsageCache, Usage } from "./cache";

const enc = get_encoding("cl100k_base");

const calculateTokenCount = (
  messages: MessageParam[],
  system: any,
  tools: Tool[]
) => {
  let tokenCount = 0;
  if (Array.isArray(messages)) {
    messages.forEach((message) => {
      if (typeof message.content === "string") {
        tokenCount += enc.encode(message.content).length;
      } else if (Array.isArray(message.content)) {
        message.content.forEach((contentPart: any) => {
          if (contentPart.type === "text") {
            tokenCount += enc.encode(contentPart.text).length;
          } else if (contentPart.type === "tool_use") {
            tokenCount += enc.encode(JSON.stringify(contentPart.input)).length;
          } else if (contentPart.type === "tool_result") {
            tokenCount += enc.encode(
              typeof contentPart.content === "string"
                ? contentPart.content
                : JSON.stringify(contentPart.content)
            ).length;
          }
        });
      }
    });
  }
  if (typeof system === "string") {
    tokenCount += enc.encode(system).length;
  } else if (Array.isArray(system)) {
    system.forEach((item: any) => {
      if (item.type !== "text") return;
      if (typeof item.text === "string") {
        tokenCount += enc.encode(item.text).length;
      } else if (Array.isArray(item.text)) {
        item.text.forEach((textPart: any) => {
          tokenCount += enc.encode(textPart || "").length;
        });
      }
    });
  }
  if (tools) {
    tools.forEach((tool: Tool) => {
      if (tool.description) {
        tokenCount += enc.encode(tool.name + tool.description).length;
      }
      if (tool.input_schema) {
        tokenCount += enc.encode(JSON.stringify(tool.input_schema)).length;
      }
    });
  }
  return tokenCount;
};

const getUseModel = async (
  req: any,
  tokenCount: number,
  config: any,
  lastUsage?: Usage | undefined
) => {
  if (req.body.model.includes(",")) {
    const [provider, model] = req.body.model.split(",");
    const finalProvider = config.Providers.find(
      (p: any) => p.name.toLowerCase() === provider
    );
    const finalModel = finalProvider?.models?.find(
      (m: any) => m.toLowerCase() === model
    );
    if (finalProvider && finalModel) {
      return `${finalProvider.name},${finalModel}`;
    }
    return req.body.model;
  }
  // if tokenCount is greater than the configured threshold, use the long context model
  const longContextThreshold = config.Router.longContextThreshold || 60000;
  const lastUsageThreshold =
    lastUsage &&
    lastUsage.input_tokens > longContextThreshold &&
    tokenCount > 20000;
  const tokenCountThreshold = tokenCount > longContextThreshold;
  if (
    (lastUsageThreshold || tokenCountThreshold) &&
    config.Router.longContext
  ) {
    log(
      "Using long context model due to token count:",
      tokenCount,
      "threshold:",
      longContextThreshold
    );
    return config.Router.longContext;
  }
  if (
    req.body?.system?.length > 1 &&
    req.body?.system[1]?.text?.startsWith("<CCR-SUBAGENT-MODEL>")
  ) {
    const model = req.body?.system[1].text.match(
      /<CCR-SUBAGENT-MODEL>(.*?)<\/CCR-SUBAGENT-MODEL>/s
    );
    if (model) {
      req.body.system[1].text = req.body.system[1].text.replace(
        `<CCR-SUBAGENT-MODEL>${model[1]}</CCR-SUBAGENT-MODEL>`,
        ""
      );
      return model[1];
    }
  }
  // If the model is claude-3-5-haiku, use the background model
  if (
    req.body.model?.startsWith("claude-3-5-haiku") &&
    config.Router.background
  ) {
    log("Using background model for ", req.body.model);
    return config.Router.background;
  }
  // if exits thinking, use the think model
  if (req.body.thinking && config.Router.think) {
    log("Using think model for ", req.body.thinking);
    return config.Router.think;
  }
  if (
    Array.isArray(req.body.tools) &&
    req.body.tools.some((tool: any) => tool.type?.startsWith("web_search")) &&
    config.Router.webSearch
  ) {
    return config.Router.webSearch;
  }
  return config.Router!.default;
};

const getDynamicApiKey = (req: any): string | null => {
  // Try to get ANTHROPIC_AUTH_TOKEN from request headers
  const authHeaderValue = req.headers.authorization || req.headers["x-api-key"];

  if (!authHeaderValue) {
    return null;
  }

  const authKey: string = Array.isArray(authHeaderValue)
    ? authHeaderValue[0]
    : authHeaderValue;

  let token = "";
  if (authKey.startsWith("Bearer")) {
    token = authKey.split(" ")[1];
  } else {
    token = authKey;
  }

  return token || null;
};

const applyDynamicApiKey = (req: any, config: any, dynamicApiKey: string | null) => {
  if (!config.DYNAMIC_API_KEY) {
    return config;
  }

  // Create a deep copy of the config to avoid modifying the original
  const configCopy = JSON.parse(JSON.stringify(config));

  // If dynamic API key is available, apply it
  if (dynamicApiKey) {
    // Clean the dynamic API key (remove Bearer prefix if present)
    const cleanApiKey = dynamicApiKey.replace(/^Bearer\s+/i, '');

    // Apply dynamic API key to all providers that support Anthropic models
    if (configCopy.Providers) {
      configCopy.Providers.forEach((provider: any) => {
        // Check if provider has Anthropic models (claude models) or doesn't have api_key set
        if (provider.models && provider.models.some((model: string) =>
          model.toLowerCase().includes("claude") ||
          provider.name.toLowerCase().includes("anthropic")
        )) {
          provider.api_key = cleanApiKey;
        }
      });
    }
  } else if (configCopy.Providers) {
    // If no dynamic API key provided but DYNAMIC_API_KEY is enabled,
    // ensure providers that need API keys but don't have them are flagged
    configCopy.Providers.forEach((provider: any) => {
      if (provider.models && provider.models.some((model: string) =>
        model.toLowerCase().includes("claude") ||
        provider.name.toLowerCase().includes("anthropic")
      ) && !provider.api_key) {
        // Set a placeholder to indicate missing API key
        provider.api_key = null;
      }
    });
  }

  return configCopy;
};

export const router = async (req: any, _res: any, config: any) => {
  // Parse sessionId from metadata.user_id
  if (req.body.metadata?.user_id) {
    const parts = req.body.metadata.user_id.split("_session_");
    if (parts.length > 1) {
      req.sessionId = parts[1];
    }
  }

  // Extract dynamic API key from request headers
  const dynamicApiKey = getDynamicApiKey(req);

  // Apply dynamic API key to config if available
  const effectiveConfig = applyDynamicApiKey(req, config, dynamicApiKey);

  // Store the effective config on the request object for later use
  req.effectiveConfig = effectiveConfig;

  // Debug logging for dynamic API key handling
  if (config.DYNAMIC_API_KEY) {
    log("Dynamic API key mode enabled");
    log("Dynamic API key present:", !!dynamicApiKey);
    log("Effective config providers:", JSON.stringify(effectiveConfig.Providers, null, 2));
  }

  const lastMessageUsage = sessionUsageCache.get(req.sessionId);
  const { messages, system = [], tools }: MessageCreateParamsBase = req.body;
  try {
    const tokenCount = calculateTokenCount(
      messages as MessageParam[],
      system,
      tools as Tool[]
    );

    let model;
    if (effectiveConfig.CUSTOM_ROUTER_PATH) {
      try {
        const customRouter = require(effectiveConfig.CUSTOM_ROUTER_PATH);
        req.tokenCount = tokenCount; // Pass token count to custom router
        model = await customRouter(req, effectiveConfig);
      } catch (e: any) {
        log("failed to load custom router", e.message);
      }
    }
    if (!model) {
      model = await getUseModel(req, tokenCount, effectiveConfig, lastMessageUsage);
    }
    req.body.model = model;
  } catch (error: any) {
    log("Error in router middleware:", error.message);
    req.body.model = effectiveConfig.Router!.default;
  }
  return;
};
