const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

const CALENDAR_PATTERN = /calendar/i;
const CHAT_PATTERN = /chat|message|slack|teams/i;

let connectPromise = null;
let state = null; // { client, calendarTool, chatTool, discoveredTools }

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name} — see backend/.env.example`);
  }
  return value;
}

function resolveTool(discoveredTools, envOverrideName, pattern, label) {
  const override = process.env[envOverrideName];
  if (override) {
    const match = discoveredTools.find((t) => t.name === override);
    if (!match) {
      throw new Error(
        `${envOverrideName}="${override}" not found among discovered Merge tools: ` +
          discoveredTools.map((t) => t.name).join(", ")
      );
    }
    return match;
  }
  const matches = discoveredTools.filter((t) => pattern.test(t.name));
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    console.warn(
      `[merge] No ${label} tool matched pattern ${pattern}. Discovered tools: ` +
        discoveredTools.map((t) => t.name).join(", ")
    );
    return null;
  }
  console.warn(
    `[merge] Multiple ${label} tool candidates matched: ${matches.map((t) => t.name).join(", ")} ` +
      `— using the first. Set ${envOverrideName} to pick explicitly.`
  );
  return matches[0];
}

async function connect() {
  const toolPackId = requireEnv("MERGE_TOOL_PACK_ID");
  const registeredUserId = requireEnv("MERGE_REGISTERED_USER_ID");
  const apiKey = requireEnv("MERGE_API_KEY");

  const url = `https://ah-api.merge.dev/api/v1/tool-packs/${toolPackId}/registered-users/${registeredUserId}/mcp`;

  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
  });

  const client = new Client({ name: "corgi-rave-backend", version: "1.0.0" });
  await client.connect(transport);

  const { tools } = await client.listTools();
  console.log(
    "[merge] discovered tools:",
    tools.map((t) => t.name).join(", ") || "(none)"
  );

  const calendarTool = resolveTool(tools, "MERGE_CALENDAR_TOOL", CALENDAR_PATTERN, "calendar");
  const chatTool = resolveTool(tools, "MERGE_CHAT_TOOL", CHAT_PATTERN, "chat");

  state = { client, calendarTool, chatTool, discoveredTools: tools };
  return state;
}

function ensureConnected() {
  if (state) return Promise.resolve(state);
  if (!connectPromise) {
    connectPromise = connect().catch((err) => {
      connectPromise = null;
      throw err;
    });
  }
  return connectPromise;
}

/**
 * Pulls today's raw calendar/chat signal for claudeBrain to summarize.
 * Returns whatever each tool's result payload contains — shape depends on
 * the actual connector, so downstream code should treat this loosely.
 */
async function getTodaySignal() {
  const { client, calendarTool, chatTool } = await ensureConnected();

  const [calendarEvents, recentMessages] = await Promise.all([
    calendarTool
      ? client.callTool({ name: calendarTool.name, arguments: {} }).catch((err) => {
          console.warn(`[merge] calendar tool call failed: ${err.message}`);
          return null;
        })
      : Promise.resolve(null),
    chatTool
      ? client.callTool({ name: chatTool.name, arguments: {} }).catch((err) => {
          console.warn(`[merge] chat tool call failed: ${err.message}`);
          return null;
        })
      : Promise.resolve(null),
  ]);

  return { calendarEvents, recentMessages };
}

function getStatus() {
  if (!state) return { connected: false };
  return {
    connected: true,
    calendarTool: state.calendarTool?.name ?? null,
    chatTool: state.chatTool?.name ?? null,
    discoveredTools: state.discoveredTools.map((t) => t.name),
  };
}

module.exports = { ensureConnected, getTodaySignal, getStatus };
