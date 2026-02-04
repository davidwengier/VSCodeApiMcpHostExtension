#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { IPCClient } from '../bridge/ipc';

const server = new McpServer({
    name: 'vscode-api-mcp',
    version: '0.1.0',
});

let ipcClient: IPCClient | null = null;

async function getIPCClient(): Promise<IPCClient> {
    if (ipcClient) {
        return ipcClient;
    }

    const socketPath = process.env.VSCODE_IPC_HOOK;
    if (!socketPath) {
        throw new Error('VSCODE_IPC_HOOK environment variable not set. Is the VS Code extension running?');
    }

    ipcClient = new IPCClient(socketPath);
    await ipcClient.connect();
    return ipcClient;
}

async function callVSCode<T>(method: string, params: unknown): Promise<T> {
    const client = await getIPCClient();
    return client.request<T>(method, params);
}

// Tool: Execute VS Code command
server.tool(
    'vscode_executeCommand',
    'Execute a VS Code command by ID with optional arguments',
    {
        command: z.string().describe('The VS Code command ID to execute (e.g., "editor.action.formatDocument")'),
        args: z.array(z.unknown()).optional().describe('Optional arguments to pass to the command'),
    },
    async ({ command, args }) => {
        try {
            const result = await callVSCode('executeCommand', { command, args });
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) || 'Command executed successfully' }],
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true,
            };
        }
    }
);

// Tool: Read file
server.tool(
    'vscode_readFile',
    'Read the contents of a file in the workspace',
    {
        path: z.string().describe('Path to the file (absolute or relative to workspace)'),
    },
    async ({ path }) => {
        try {
            const content = await callVSCode<string>('readFile', { path });
            return {
                content: [{ type: 'text', text: content }],
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `Error reading file: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true,
            };
        }
    }
);

// Tool: Write file
server.tool(
    'vscode_writeFile',
    'Write content to a file in the workspace (creates if not exists)',
    {
        path: z.string().describe('Path to the file (absolute or relative to workspace)'),
        content: z.string().describe('Content to write to the file'),
    },
    async ({ path, content }) => {
        try {
            await callVSCode('writeFile', { path, content });
            return {
                content: [{ type: 'text', text: `Successfully wrote to ${path}` }],
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `Error writing file: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true,
            };
        }
    }
);

// Tool: Get configuration
server.tool(
    'vscode_getConfig',
    'Get VS Code configuration values',
    {
        section: z.string().describe('Configuration section (e.g., "editor", "files")'),
        key: z.string().optional().describe('Specific key within the section'),
    },
    async ({ section, key }) => {
        try {
            const result = await callVSCode('getConfig', { section, key });
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `Error getting config: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true,
            };
        }
    }
);

// Tool: Set configuration
server.tool(
    'vscode_setConfig',
    'Update VS Code configuration values',
    {
        section: z.string().describe('Configuration section (e.g., "editor", "files")'),
        key: z.string().describe('Configuration key to update'),
        value: z.unknown().describe('Value to set'),
        global: z.boolean().optional().describe('If true, update global settings; otherwise workspace settings'),
    },
    async ({ section, key, value, global }) => {
        try {
            await callVSCode('setConfig', { section, key, value, global });
            return {
                content: [{ type: 'text', text: `Successfully updated ${section}.${key}` }],
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `Error setting config: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true,
            };
        }
    }
);

// Tool: Get active editor info
server.tool(
    'vscode_getActiveEditor',
    'Get information about the currently active editor',
    {},
    async () => {
        try {
            const result = await callVSCode('getActiveEditor', {});
            if (!result) {
                return {
                    content: [{ type: 'text', text: 'No active editor' }],
                };
            }
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true,
            };
        }
    }
);

// Tool: Show message
server.tool(
    'vscode_showMessage',
    'Display a message to the user in VS Code',
    {
        type: z.enum(['info', 'warning', 'error']).describe('Type of message to show'),
        message: z.string().describe('Message text to display'),
        items: z.array(z.string()).optional().describe('Optional action buttons'),
    },
    async ({ type, message, items }) => {
        try {
            const result = await callVSCode<{ selectedItem?: string }>('showMessage', { type, message, items });
            return {
                content: [{ type: 'text', text: result.selectedItem ? `User selected: ${result.selectedItem}` : 'Message shown' }],
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true,
            };
        }
    }
);

// Tool: Get workspace folders
server.tool(
    'vscode_getWorkspaceFolders',
    'Get the list of workspace folders currently open',
    {},
    async () => {
        try {
            const result = await callVSCode('getWorkspaceFolders', {});
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true,
            };
        }
    }
);

// Tool: List files
server.tool(
    'vscode_listFiles',
    'List files in the workspace matching a glob pattern',
    {
        pattern: z.string().optional().describe('Glob pattern to match files (default: **/**)'),
        maxResults: z.number().optional().describe('Maximum number of results to return (default: 1000)'),
    },
    async ({ pattern, maxResults }) => {
        try {
            const result = await callVSCode('listFiles', { pattern, maxResults });
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true,
            };
        }
    }
);

// Tool: Open file
server.tool(
    'vscode_openFile',
    'Open a file in the VS Code editor',
    {
        path: z.string().describe('Path to the file to open'),
        preview: z.boolean().optional().describe('Open in preview mode (default: true)'),
    },
    async ({ path, preview }) => {
        try {
            await callVSCode('openFile', { path, preview });
            return {
                content: [{ type: 'text', text: `Opened ${path}` }],
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true,
            };
        }
    }
);

// Tool: Get open editors
server.tool(
    'vscode_getOpenEditors',
    'Get list of currently open editor tabs',
    {},
    async () => {
        try {
            const result = await callVSCode('getOpenEditors', {});
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true,
            };
        }
    }
);

// Tool: Get diagnostics (errors/warnings)
server.tool(
    'vscode_getDiagnostics',
    'Get diagnostics (errors, warnings) for a file or the entire workspace',
    {
        path: z.string().optional().describe('Path to file to get diagnostics for. If omitted, returns all workspace diagnostics'),
    },
    async ({ path }) => {
        try {
            const result = await callVSCode('getDiagnostics', { path });
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true,
            };
        }
    }
);

// Start the server
async function main(): Promise<void> {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('VS Code API MCP Server started');
}

main().catch((error) => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
});
