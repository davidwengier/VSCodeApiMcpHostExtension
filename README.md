<p align="center">
  <img src="icon.png" alt="VS Code API MCP Server" width="128" height="128">
</p>

# VS Code API MCP Server

A VS Code extensionthat exposes VS Code APIs as an MCP (Model Context Protocol) server, allowing AI agents like GitHub Copilot CLI, Claude, or other MCP clients to interact with VS Code.

## Features

This extension provides the following MCP tools:

| Tool | Description |
|------|-------------|
| `vscode_executeCommand` | Execute any VS Code command by ID |
| `vscode_readFile` | Read file contents from the workspace |
| `vscode_writeFile` | Write/create files in the workspace |
| `vscode_getConfig` | Get VS Code configuration values |
| `vscode_setConfig` | Update VS Code configuration values |
| `vscode_getActiveEditor` | Get info about the active editor (path, selection, language) |
| `vscode_showMessage` | Display messages to the user |
| `vscode_getWorkspaceFolders` | Get list of open workspace folders |
| `vscode_listFiles` | List files matching a glob pattern |
| `vscode_openFile` | Open a file in the editor |
| `vscode_getOpenEditors` | Get list of open editor tabs |
| `vscode_getDiagnostics` | Get errors/warnings for files |

## Installation

### From Source

1. Clone this repository
2. Run `npm install`
3. Run `npm run build`
4. Press F5 to launch a development instance of VS Code with the extension loaded

### From VSIX

```bash
code --install-extension vscode-api-mcp-0.1.0.vsix
```

## Usage

### With GitHub Copilot CLI (Recommended: HTTP)

The simplest configuration - just add the HTTP URL to your MCP settings:

```json
{
  "servers": {
    "vscode-api": {
      "type": "http",
      "url": "http://127.0.0.1:6010/mcp"
    }
  }
}
```

That's it! No command to run, no environment variables. The extension runs the MCP server directly.

### With GitHub Copilot CLI (Alternative: stdio)

If you prefer the stdio transport:

```json
{
  "servers": {
    "vscode-api": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/extension/dist/server.js"],
      "env": {
        "VSCODE_IPC_HOOK": "\\\\.\\pipe\\vscode-api-mcp.sock"
      }
    }
  }
}
```

> **Note:** The default socket path is `\\.\pipe\vscode-api-mcp.sock` on Windows or `/tmp/vscode-api-mcp.sock` on macOS/Linux.

The extension automatically starts an IPC server when VS Code launches. You can check the socket path by running the command **VS Code API MCP: Show Server Status**.

### With VS Code's Built-in MCP Support

The extension registers itself as an MCP server definition provider. You can enable it via:

1. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Run **MCP: List Servers**
3. Enable "VS Code API MCP Server"

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    VS Code Extension                     │
│                                                          │
│  ┌────────────────┐    IPC    ┌────────────────────┐    │
│  │  IPC Server    │◄─────────►│   VS Code APIs     │    │
│  │  (Named Pipe)  │           │                    │    │
│  └───────┬────────┘           └────────────────────┘    │
└──────────┼──────────────────────────────────────────────┘
           │
           │ IPC (Named Pipe / Unix Socket)
           │
┌──────────▼──────────┐
│    MCP Server       │
│  (stdio transport)  │
│                     │
│  ┌────────────────┐ │
│  │ Tools (12)     │ │
│  │ - executeCmd   │ │
│  │ - readFile     │ │
│  │ - writeFile    │ │
│  │ - getConfig    │ │
│  │ - setConfig    │ │
│  │ - etc...       │ │
│  └────────────────┘ │
└──────────┬──────────┘
           │
           │ stdio (JSON-RPC)
           │
┌──────────▼──────────┐
│     AI Agent        │
│  (Copilot CLI,      │
│   Claude, etc.)     │
└─────────────────────┘
```

The extension consists of two parts:
1. **VS Code Extension** - Runs in the extension host, provides access to VS Code APIs via an IPC server
2. **MCP Server** - A separate Node.js process that speaks MCP protocol over stdio and communicates with the extension via IPC

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `vscode-api-mcp.autoStart` | `true` | Automatically start the MCP servers when VS Code starts |
| `vscode-api-mcp.logLevel` | `info` | Log level: debug, info, warn, error |
| `vscode-api-mcp.httpPort` | `6010` | Port for the HTTP MCP server |
| `vscode-api-mcp.socketPath` | `""` | Custom socket path for IPC (stdio transport). Leave empty for default |

## Commands

- **VS Code API MCP: Start Server** - Start the IPC server
- **VS Code API MCP: Stop Server** - Stop the IPC server
- **VS Code API MCP: Show Status** - Show the current server status and socket path

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run watch

# Lint
npm run lint
```

## Security Considerations

- Tools that modify files (`vscode_writeFile`) or execute commands (`vscode_executeCommand`) should be used with care
- The MCP protocol supports tool confirmation dialogs - clients should prompt users before executing potentially destructive operations
- The IPC socket is local-only and uses a predictable path - consider the security implications for your environment

## License

MIT - see [LICENSE](LICENSE) for details.
