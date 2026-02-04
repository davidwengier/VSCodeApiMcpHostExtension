# Changelog

All notable changes to the "VS Code API MCP Server" extension will be documented in this file.

## [0.1.0] - 2026-02-04

### Added

- Initial release
- MCP server exposing VS Code APIs to AI agents
- 12 tools for interacting with VS Code:
  - `vscode_executeCommand` - Execute VS Code commands
  - `vscode_readFile` - Read workspace files
  - `vscode_writeFile` - Write/create files
  - `vscode_getConfig` - Get configuration values
  - `vscode_setConfig` - Update configuration
  - `vscode_getActiveEditor` - Get active editor info
  - `vscode_showMessage` - Display messages
  - `vscode_getWorkspaceFolders` - List workspace folders
  - `vscode_listFiles` - Find files by glob pattern
  - `vscode_openFile` - Open files in editor
  - `vscode_getOpenEditors` - List open editor tabs
  - `vscode_getDiagnostics` - Get errors/warnings
- IPC bridge between MCP server and VS Code extension
- Auto-start on VS Code launch
- Built-in MCP server definition provider for VS Code's native MCP support
