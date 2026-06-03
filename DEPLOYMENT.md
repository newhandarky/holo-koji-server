# Deployment Notes

## Render service

- Service: `holo-koji-server`
- Repository: `newhandarky/holo-koji-server`
- Branch: `main`
- Runtime: Node.js 20 via `.nvmrc`
- Build command currently configured in Render: `npm install`
- Start command: `npm start`

The server is TypeScript-first and starts from `dist/index.js`. Because Render currently runs only `npm install` as the build command, `package.json` keeps `postinstall` wired to `npm run build`. Do not remove `postinstall` unless the Render build command is changed to run `npm run build` explicitly, for example `npm install && npm run build`.

## Health check

Use the public health endpoint to confirm that the deployed HTTP server is running:

```bash
curl -i https://holo-koji-server.onrender.com/health
```

Expected response:

- HTTP 200
- JSON body with `status: "ok"`
- `environment` should be `production` on Render

The root path can return 404. That does not mean the service failed; the deployed service is validated through `/health` and WebSocket behavior.

## Local deployment verification

Before merging deployment-sensitive server changes, run the deploy verification script:

```bash
npm run verify:deploy
```

This script runs the backend test suite, checks a production install dry run, and confirms that `dist/index.js` exists and parses. For a manual clean-install artifact check, create a temporary copy without `node_modules` or `dist`, then run:

```bash
npm install
test -f dist/index.js
node --check dist/index.js
```

These checks protect the two Render failure modes fixed after the NPC strategy split:

- GitHub Packages install auth failure for shared types.
- Missing `dist/index.js` when Render starts the service.
