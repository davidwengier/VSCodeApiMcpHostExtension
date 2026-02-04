# Copilot Instructions for VS Code API MCP Server

## Build & Development Commands

```bash
npm install      # Install dependencies
npm run build    # Build extension and MCP server
npm run watch    # Watch mode for development
npm run lint     # Run ESLint on src/
```

To test: Press F5 in VS Code to launch a development Extension Host with the extension loaded.

## Architecture

This is a VS Code extension that exposes VS Code APIs to external AI agents via the Model Context Protocol (MCP).

**Two-process architecture:**

1. **Extension** (`src/extension.ts`) - Runs in VS Code's extension host, has access to `vscode.*` APIs. Starts an IPC server (named pipe on Windows, Unix socket elsewhere) to receive requests.

2. **MCP Server** (`src/server/index.ts`) - Standalone Node.js process that speaks MCP protocol over stdio. Connects to the extension via IPC to proxy VS Code API calls.

**Request flow:**
```
AI Agent → (stdio/MCP) → server/index.ts → (IPC) → extension.ts → vscode.* APIs
```

**Build outputs** (via esbuild):
- `dist/extension.js` - Extension entry point (excludes `vscode` module)
- `dist/server.js` - MCP server entry point (fully bundled)

## Key Conventions

- **IPC protocol**: Newline-delimited JSON over named pipes/Unix sockets. See `src/bridge/ipc.ts` for `IPCServer`/`IPCClient` classes.

- **Adding new tools**: Register tools in `src/server/index.ts` using `server.tool()` with Zod schemas. Add corresponding handler case in `handleVSCodeRequest()` switch in `extension.ts`.

- **File paths**: The `resolveUri()` helper resolves relative paths against the first workspace folder. Tools accept both absolute and relative paths.

- **Configuration**: Extension settings are prefixed with `vscode-api-mcp.` and defined in `package.json` under `contributes.configuration`.
