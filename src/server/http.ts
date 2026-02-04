import * as http from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

export type RequestHandler = (method: string, params: unknown) => Promise<unknown>;

export class HttpMcpServer {
    private server: http.Server | null = null;
    private mcpServer: McpServer;
    private transport: StreamableHTTPServerTransport | null = null;
    private port: number;
    private handler: RequestHandler;

    constructor(handler: RequestHandler, port: number = 6010) {
        this.handler = handler;
        this.port = port;
        this.mcpServer = new McpServer({
            name: 'vscode-api-mcp',
            version: '0.1.0',
        });
        this.registerTools();
    }

    private async callVSCode<T>(method: string, params: unknown): Promise<T> {
        return this.handler(method, params) as Promise<T>;
    }

    private registerTools(): void {
        // Tool: Execute VS Code command
        this.mcpServer.tool(
            'vscode_executeCommand',
            'Execute a VS Code command by ID with optional arguments',
            {
                command: z.string().describe('The VS Code command ID to execute (e.g., "editor.action.formatDocument")'),
                args: z.array(z.unknown()).optional().describe('Optional arguments to pass to the command'),
            },
            async ({ command, args }) => {
                try {
                    const result = await this.callVSCode('executeCommand', { command, args });
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
        this.mcpServer.tool(
            'vscode_readFile',
            'Read the contents of a file in the workspace',
            {
                path: z.string().describe('Path to the file (absolute or relative to workspace)'),
            },
            async ({ path }) => {
                try {
                    const content = await this.callVSCode<string>('readFile', { path });
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
        this.mcpServer.tool(
            'vscode_writeFile',
            'Write content to a file in the workspace (creates if not exists)',
            {
                path: z.string().describe('Path to the file (absolute or relative to workspace)'),
                content: z.string().describe('Content to write to the file'),
            },
            async ({ path, content }) => {
                try {
                    await this.callVSCode('writeFile', { path, content });
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
        this.mcpServer.tool(
            'vscode_getConfig',
            'Get VS Code configuration values',
            {
                section: z.string().describe('Configuration section (e.g., "editor", "files")'),
                key: z.string().optional().describe('Specific key within the section'),
            },
            async ({ section, key }) => {
                try {
                    const result = await this.callVSCode('getConfig', { section, key });
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
        this.mcpServer.tool(
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
                    await this.callVSCode('setConfig', { section, key, value, global });
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
        this.mcpServer.tool(
            'vscode_getActiveEditor',
            'Get information about the currently active editor',
            {},
            async () => {
                try {
                    const result = await this.callVSCode('getActiveEditor', {});
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
        this.mcpServer.tool(
            'vscode_showMessage',
            'Display a message to the user in VS Code',
            {
                type: z.enum(['info', 'warning', 'error']).describe('Type of message to show'),
                message: z.string().describe('Message text to display'),
                items: z.array(z.string()).optional().describe('Optional action buttons'),
            },
            async ({ type, message, items }) => {
                try {
                    const result = await this.callVSCode<{ selectedItem?: string }>('showMessage', { type, message, items });
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
        this.mcpServer.tool(
            'vscode_getWorkspaceFolders',
            'Get the list of workspace folders currently open',
            {},
            async () => {
                try {
                    const result = await this.callVSCode('getWorkspaceFolders', {});
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
        this.mcpServer.tool(
            'vscode_listFiles',
            'List files in the workspace matching a glob pattern',
            {
                pattern: z.string().optional().describe('Glob pattern to match files (default: **/**)'),
                maxResults: z.number().optional().describe('Maximum number of results to return (default: 1000)'),
            },
            async ({ pattern, maxResults }) => {
                try {
                    const result = await this.callVSCode('listFiles', { pattern, maxResults });
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
        this.mcpServer.tool(
            'vscode_openFile',
            'Open a file in the VS Code editor',
            {
                path: z.string().describe('Path to the file to open'),
                preview: z.boolean().optional().describe('Open in preview mode (default: true)'),
            },
            async ({ path, preview }) => {
                try {
                    await this.callVSCode('openFile', { path, preview });
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
        this.mcpServer.tool(
            'vscode_getOpenEditors',
            'Get list of currently open editor tabs',
            {},
            async () => {
                try {
                    const result = await this.callVSCode('getOpenEditors', {});
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

        // Tool: Get diagnostics
        this.mcpServer.tool(
            'vscode_getDiagnostics',
            'Get diagnostics (errors, warnings) for a file or the entire workspace',
            {
                path: z.string().optional().describe('Path to file to get diagnostics for. If omitted, returns all workspace diagnostics'),
            },
            async ({ path }) => {
                try {
                    const result = await this.callVSCode('getDiagnostics', { path });
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

        // Tool: Set selection
        this.mcpServer.tool(
            'vscode_setSelection',
            'Set the selection in the active editor. Can select a range of text or position the cursor.',
            {
                startLine: z.number().describe('Start line number (0-based)'),
                startCharacter: z.number().optional().describe('Start character position (0-based, default: 0)'),
                endLine: z.number().optional().describe('End line number (0-based, default: same as startLine)'),
                endCharacter: z.number().optional().describe('End character position (0-based, default: end of line)'),
            },
            async ({ startLine, startCharacter, endLine, endCharacter }) => {
                try {
                    const result = await this.callVSCode('setSelection', { startLine, startCharacter, endLine, endCharacter });
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
    }

    async start(): Promise<void> {
        this.transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => `session-${Date.now()}`,
        });

        this.server = http.createServer(async (req, res) => {
            // Handle CORS
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');

            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }

            // Only handle /mcp endpoint
            if (req.url !== '/mcp') {
                res.writeHead(404);
                res.end('Not found');
                return;
            }

            await this.transport!.handleRequest(req, res);
        });

        await this.mcpServer.connect(this.transport);

        return new Promise((resolve, reject) => {
            this.server!.listen(this.port, '127.0.0.1', () => {
                console.log(`HTTP MCP server listening on http://127.0.0.1:${this.port}/mcp`);
                resolve();
            });
            this.server!.on('error', reject);
        });
    }

    stop(): void {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
        if (this.transport) {
            this.transport = null;
        }
    }

    getUrl(): string {
        return `http://127.0.0.1:${this.port}/mcp`;
    }

    getPort(): number {
        return this.port;
    }
}
