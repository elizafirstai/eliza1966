// Build dist/ from site/: wrap index.html in a full HTML document and set the
// bridge URL.   BRIDGE_URL=wss://eliza1966.xyz/ws node tools/build.mjs
// (default: same-origin, i.e. the bridge serves the site at /ws)
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.join(root, 'site');
const out = path.join(root, 'dist');
const bridge = process.env.BRIDGE_URL ?? 'same-origin';

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });

const body = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
const headEnd = body.indexOf('</style>') + '</style>'.length;
const head = body.slice(0, headEnd).replace(/<meta name="viewport"[^>]*>\n?/, '');
const rest = body.slice(headEnd);
fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="icon" href="img/eliza-stipple.png">
${head}
</head>
<body>
${rest.trim()}
</body>
</html>
`);

const cfg = path.join(out, 'js', 'config.js');
fs.writeFileSync(cfg, fs.readFileSync(cfg, 'utf8').replace(/bridgeUrl: '[^']*'/, `bridgeUrl: '${bridge}'`));
console.log(`dist/ built, bridgeUrl = ${bridge || '(none: JavaScript port only)'}`);
