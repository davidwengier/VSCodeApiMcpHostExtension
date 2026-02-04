import * as net from 'net';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export interface IPCRequest {
    id: string;
    method: string;
    params: unknown;
}

export interface IPCResponse {
    id: string;
    result?: unknown;
    error?: {
        message: string;
        code?: number;
    };
}

export type RequestHandler = (method: string, params: unknown) => Promise<unknown>;

const IPC_SOCKET_NAME = 'vscode-api-mcp.sock';

export function getDefaultSocketPath(): string {
    if (process.platform === 'win32') {
        return `\\\\.\\pipe\\${IPC_SOCKET_NAME}`;
    }
    return path.join(os.tmpdir(), IPC_SOCKET_NAME);
}

export class IPCServer {
    private server: net.Server | null = null;
    private handler: RequestHandler;
    private socketPath: string;

    constructor(handler: RequestHandler, socketPath?: string) {
        this.handler = handler;
        this.socketPath = socketPath || getDefaultSocketPath();
    }

    async start(): Promise<void> {
        // Clean up old socket if exists
        if (process.platform !== 'win32') {
            try {
                fs.unlinkSync(this.socketPath);
            } catch {
                // Ignore
            }
        }

        return new Promise((resolve, reject) => {
            this.server = net.createServer((socket) => {
                let buffer = '';

                socket.on('data', async (data) => {
                    buffer += data.toString();
                    
                    // Handle multiple messages in buffer
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        
                        try {
                            const request: IPCRequest = JSON.parse(line);
                            let response: IPCResponse;

                            try {
                                const result = await this.handler(request.method, request.params);
                                response = { id: request.id, result };
                            } catch (error) {
                                response = {
                                    id: request.id,
                                    error: {
                                        message: error instanceof Error ? error.message : String(error),
                                    },
                                };
                            }

                            socket.write(JSON.stringify(response) + '\n');
                        } catch (parseError) {
                            console.error('Failed to parse IPC message:', parseError);
                        }
                    }
                });

                socket.on('error', (err) => {
                    console.error('IPC socket error:', err);
                });
            });

            this.server.listen(this.socketPath, () => {
                console.log(`IPC server listening on ${this.socketPath}`);
                resolve();
            });

            this.server.on('error', reject);
        });
    }

    stop(): void {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }

    getSocketPath(): string {
        return this.socketPath;
    }
}

export class IPCClient {
    private socket: net.Socket | null = null;
    private socketPath: string;
    private pendingRequests = new Map<string, {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
    }>();
    private requestId = 0;
    private buffer = '';

    constructor(socketPath?: string) {
        this.socketPath = socketPath || getDefaultSocketPath();
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.socket = net.createConnection(this.socketPath, () => {
                resolve();
            });

            this.socket.on('data', (data) => {
                this.buffer += data.toString();
                
                const lines = this.buffer.split('\n');
                this.buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    
                    try {
                        const response: IPCResponse = JSON.parse(line);
                        const pending = this.pendingRequests.get(response.id);
                        
                        if (pending) {
                            this.pendingRequests.delete(response.id);
                            if (response.error) {
                                pending.reject(new Error(response.error.message));
                            } else {
                                pending.resolve(response.result);
                            }
                        }
                    } catch (parseError) {
                        console.error('Failed to parse IPC response:', parseError);
                    }
                }
            });

            this.socket.on('error', (err) => {
                reject(err);
            });

            this.socket.on('close', () => {
                // Reject all pending requests
                for (const [id, pending] of this.pendingRequests) {
                    pending.reject(new Error('Connection closed'));
                    this.pendingRequests.delete(id);
                }
            });
        });
    }

    async request<T>(method: string, params: unknown): Promise<T> {
        if (!this.socket) {
            throw new Error('Not connected');
        }

        const id = String(++this.requestId);
        const request: IPCRequest = { id, method, params };

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, {
                resolve: resolve as (value: unknown) => void,
                reject,
            });

            this.socket!.write(JSON.stringify(request) + '\n');
        });
    }

    disconnect(): void {
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
    }
}
