# Photon + Merge — Hackathon Notes

Notes from the Merge team (Corgi cafe, 2026-07-25) on Agent Handler, Gateway, and importing Photon's MCP server.

## Agent Handler Resources
- [Agent Handler Product Overview](https://docs.merge.dev/merge-agent-handler/setup/building-an-agent)
- [Agent Handler Connectors List](https://docs.merge.dev/merge-agent-handler/connectors/overview)
- [Tool Packs](https://docs.merge.dev/merge-agent-handler/build/tools/tool-packs)
- [Registered Users](https://docs.merge.dev/merge-agent-handler/build/users/registered-users)
- [MCP Endpoint](https://docs.merge.dev/merge-agent-handler/build/connecting-agents/mcp-integration)
- [Application Credentials Overview](https://docs.merge.dev/merge-agent-handler/administer/application-credentials)

## Gateway Resources
- [Getting Started](https://docs.merge.dev/merge-gateway/get-started)
- [Gateway Skills](https://docs.merge.dev/merge-gateway/install-skills)
- [Gateway Routing Project Setup](https://docs.merge.dev/merge-gateway/features/projects)

Gateway is the enterprise-ready version of Agent Handler — production AI with customer-level controls, security, and governance. Differences vs. Agent Handler:
- Budget tracking: track LLM spend by provider, model, customer/tenant, project, etc.
- Security/DLP layer: protects sensitive information from being passed to models in prompts and context.
- Intelligent routing: built-in and custom routers to optimize LLM routing for a given platform/use case.

## Importing Photon's MCP server into Agent Handler
You can import Photon's public MCP server into Agent Handler. Once imported, you can add tools from their server into your tool pack, surfacing Photon tools to your agent through the same Agent Handler MCP connection.

- [Merge Remote MCP Server Import Documentation](https://docs.merge.dev/merge-agent-handler/build/connecting-agents/custom-mcp-servers)
- [Photon MCP Client Registration Documentation](https://github.com/portel-dev/photon/blob/23540399e1e3db3c52b803863ba975b0d95ca322/docs/guides/mcp-client-registration.md)

## Social connectors (Instagram, X, TikTok, YouTube)
Instagram requires importing a remote MCP server specifically for it. Merge has native connectors for platforms like X, TikTok, and YouTube.

- Full connector list: [https://docs.merge.dev/merge-agent-handler/connectors/overview](https://docs.merge.dev/merge-agent-handler/connectors/overview)

## Contacts
- Dammy Adeoti, Ana, Arthur, Aidan — Merge team, available at the Corgi cafe for setup help.
