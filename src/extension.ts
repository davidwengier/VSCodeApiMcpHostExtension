import * as vscode from 'vscode';
import * as path from 'path';
import { IPCServer, getDefaultSocketPath } from './bridge/ipc';
import { HttpMcpServer } from './server/http';

let ipcServer: IPCServer | null = null;
let httpMcpServer: HttpMcpServer | null = null;
let outputChannel: vscode.OutputChannel;

function log(message: string, level: 'debug' | 'info' | 'warn' | 'error' = 'info'): void {
    const config = vscode.workspace.getConfiguration('vscode-api-mcp');
    const configLevel = config.get<string>('logLevel', 'info');
    const levels = ['debug', 'info', 'warn', 'error'];
    
    if (levels.indexOf(level) >= levels.indexOf(configLevel)) {
        outputChannel.appendLine(`[${level.toUpperCase()}] ${message}`);
    }
}

async function handleVSCodeRequest(method: string, params: unknown): Promise<unknown> {
    log(`Handling request: ${method}`, 'debug');
    
    switch (method) {
        case 'executeCommand': {
            const { command, args } = params as { command: string; args?: unknown[] };
            return vscode.commands.executeCommand(command, ...(args || []));
        }

        case 'readFile': {
            const { path: filePath } = params as { path: string };
            const uri = resolveUri(filePath);
            const content = await vscode.workspace.fs.readFile(uri);
            return new TextDecoder().decode(content);
        }

        case 'writeFile': {
            const { path: filePath, content } = params as { path: string; content: string };
            const uri = resolveUri(filePath);
            await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
            return { success: true };
        }

        case 'getConfig': {
            const { section, key } = params as { section: string; key?: string };
            const config = vscode.workspace.getConfiguration(section);
            if (key) {
                return config.get(key);
            }
            return config;
        }

        case 'setConfig': {
            const { section, key, value, global } = params as { 
                section: string; 
                key: string; 
                value: unknown;
                global?: boolean;
            };
            const config = vscode.workspace.getConfiguration(section);
            await config.update(key, value, global ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.Workspace);
            return { success: true };
        }

        case 'getActiveEditor': {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return null;
            }
            return {
                filePath: editor.document.uri.fsPath,
                languageId: editor.document.languageId,
                selection: {
                    start: { line: editor.selection.start.line, character: editor.selection.start.character },
                    end: { line: editor.selection.end.line, character: editor.selection.end.character },
                },
                selectedText: editor.document.getText(editor.selection),
                lineCount: editor.document.lineCount,
            };
        }

        case 'showMessage': {
            const { type, message, items } = params as { 
                type: 'info' | 'warning' | 'error'; 
                message: string;
                items?: string[];
            };
            let result: string | undefined;
            switch (type) {
                case 'warning':
                    result = await vscode.window.showWarningMessage(message, ...(items || []));
                    break;
                case 'error':
                    result = await vscode.window.showErrorMessage(message, ...(items || []));
                    break;
                default:
                    result = await vscode.window.showInformationMessage(message, ...(items || []));
            }
            return { selectedItem: result };
        }

        case 'getWorkspaceFolders': {
            return vscode.workspace.workspaceFolders?.map(f => ({
                name: f.name,
                uri: f.uri.fsPath,
            })) || [];
        }

        case 'listFiles': {
            const { pattern, maxResults } = params as { pattern?: string; maxResults?: number };
            const files = await vscode.workspace.findFiles(pattern || '**/*', '**/node_modules/**', maxResults || 1000);
            return files.map(f => f.fsPath);
        }

        case 'openFile': {
            const { path: filePath, preview } = params as { path: string; preview?: boolean };
            const uri = resolveUri(filePath);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, { preview: preview !== false });
            return { success: true };
        }

        case 'getOpenEditors': {
            return vscode.window.tabGroups.all.flatMap(group => 
                group.tabs.map(tab => {
                    const input = tab.input;
                    if (input instanceof vscode.TabInputText) {
                        return { uri: input.uri.fsPath, isActive: tab.isActive };
                    }
                    return null;
                }).filter(Boolean)
            );
        }

        case 'getDiagnostics': {
            const { path: filePath } = params as { path?: string };
            if (filePath) {
                const uri = resolveUri(filePath);
                const diagnostics = vscode.languages.getDiagnostics(uri);
                return formatDiagnostics(diagnostics);
            }
            // Get all diagnostics
            const allDiagnostics = vscode.languages.getDiagnostics();
            return allDiagnostics.map(([uri, diagnostics]) => ({
                uri: uri.fsPath,
                diagnostics: formatDiagnostics(diagnostics),
            }));
        }

        case 'setSelection': {
            const { startLine, startCharacter, endLine, endCharacter } = params as {
                startLine: number;
                startCharacter?: number;
                endLine?: number;
                endCharacter?: number;
            };
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                throw new Error('No active editor');
            }
            const start = new vscode.Position(startLine, startCharacter ?? 0);
            const end = new vscode.Position(endLine ?? startLine, endCharacter ?? (endLine === undefined ? editor.document.lineAt(startLine).text.length : 0));
            editor.selection = new vscode.Selection(start, end);
            editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenter);
            return {
                success: true,
                selection: {
                    start: { line: start.line, character: start.character },
                    end: { line: end.line, character: end.character },
                },
                selectedText: editor.document.getText(editor.selection),
            };
        }

        default:
            throw new Error(`Unknown method: ${method}`);
    }
}

function resolveUri(filePath: string): vscode.Uri {
    if (path.isAbsolute(filePath)) {
        return vscode.Uri.file(filePath);
    }
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
        return vscode.Uri.joinPath(workspaceFolder.uri, filePath);
    }
    return vscode.Uri.file(filePath);
}

function formatDiagnostics(diagnostics: readonly vscode.Diagnostic[]): unknown[] {
    return diagnostics.map(d => ({
        message: d.message,
        severity: vscode.DiagnosticSeverity[d.severity],
        range: {
            start: { line: d.range.start.line, character: d.range.start.character },
            end: { line: d.range.end.line, character: d.range.end.character },
        },
        source: d.source,
        code: d.code,
    }));
}

async function startIPCServer(): Promise<void> {
    if (ipcServer) {
        log('IPC server already running');
        return;
    }

    const config = vscode.workspace.getConfiguration('vscode-api-mcp');
    const customSocketPath = config.get<string>('socketPath', '');
    const socketPath = customSocketPath || getDefaultSocketPath();

    ipcServer = new IPCServer(handleVSCodeRequest, socketPath);
    await ipcServer.start();
    log(`IPC server started at ${ipcServer.getSocketPath()}`);
}

function stopIPCServer(): void {
    if (ipcServer) {
        ipcServer.stop();
        ipcServer = null;
        log('IPC server stopped');
    }
}

async function startHttpServer(): Promise<void> {
    if (httpMcpServer) {
        log('HTTP MCP server already running');
        return;
    }

    const config = vscode.workspace.getConfiguration('vscode-api-mcp');
    const port = config.get<number>('httpPort', 6010);

    httpMcpServer = new HttpMcpServer(handleVSCodeRequest, port);
    await httpMcpServer.start();
    log(`HTTP MCP server started at ${httpMcpServer.getUrl()}`);
}

function stopHttpServer(): void {
    if (httpMcpServer) {
        httpMcpServer.stop();
        httpMcpServer = null;
        log('HTTP MCP server stopped');
    }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    outputChannel = vscode.window.createOutputChannel('VS Code API MCP');
    context.subscriptions.push(outputChannel);

    log('Activating VS Code API MCP extension');

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-api-mcp.startServer', async () => {
            try {
                await startIPCServer();
                await startHttpServer();
                vscode.window.showInformationMessage(`MCP servers started. HTTP: http://127.0.0.1:${httpMcpServer?.getPort() || 6010}/mcp`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to start server: ${error}`);
            }
        }),

        vscode.commands.registerCommand('vscode-api-mcp.stopServer', () => {
            stopIPCServer();
            stopHttpServer();
            vscode.window.showInformationMessage('MCP servers stopped');
        }),

        vscode.commands.registerCommand('vscode-api-mcp.showStatus', () => {
            const messages: string[] = [];
            if (ipcServer) {
                messages.push(`IPC: ${ipcServer.getSocketPath()}`);
            }
            if (httpMcpServer) {
                messages.push(`HTTP: ${httpMcpServer.getUrl()}`);
            }
            if (messages.length === 0) {
                vscode.window.showInformationMessage('MCP servers are not running');
            } else {
                vscode.window.showInformationMessage(`MCP servers running - ${messages.join(', ')}`);
            }
        })
    );

    // Register MCP server definition provider
    context.subscriptions.push(
        vscode.lm.registerMcpServerDefinitionProvider('vscode-api-mcp', {
            provideMcpServerDefinitions(): vscode.McpServerDefinition[] {
                const serverPath = path.join(context.extensionPath, 'dist', 'server.js');
                return [
                    {
                        label: 'VS Code API MCP Server',
                        serverInfo: {
                            type: vscode.McpServerDefinitionType.Stdio,
                            command: 'node',
                            args: [serverPath],
                            env: {
                                VSCODE_IPC_HOOK: ipcServer?.getSocketPath() || '',
                            },
                        },
                    },
                ];
            },
        })
    );

    // Auto-start if configured
    const config = vscode.workspace.getConfiguration('vscode-api-mcp');
    if (config.get<boolean>('autoStart', true)) {
        try {
            await startIPCServer();
        } catch (error) {
            log(`Failed to auto-start IPC server: ${error}`, 'error');
        }
        try {
            await startHttpServer();
        } catch (error) {
            log(`Failed to auto-start HTTP server: ${error}`, 'error');
        }
    }

    log('Extension activated');
}

export function deactivate(): void {
    stopIPCServer();
    stopHttpServer();
}
