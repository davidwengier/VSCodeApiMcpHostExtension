const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');

const sharedConfig = {
    bundle: true,
    minify: !isWatch,
    sourcemap: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    logLevel: 'info',
};

// Build extension
const extensionConfig = {
    ...sharedConfig,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    external: ['vscode'],
};

// Build MCP server (separate entry point for stdio)
const serverConfig = {
    ...sharedConfig,
    entryPoints: ['src/server/index.ts'],
    outfile: 'dist/server.js',
    external: [],
};

async function build() {
    try {
        if (isWatch) {
            const extCtx = await esbuild.context(extensionConfig);
            const serverCtx = await esbuild.context(serverConfig);
            await Promise.all([extCtx.watch(), serverCtx.watch()]);
            console.log('Watching for changes...');
        } else {
            await Promise.all([
                esbuild.build(extensionConfig),
                esbuild.build(serverConfig),
            ]);
            console.log('Build complete');
        }
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

build();
