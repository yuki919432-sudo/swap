// Metro configured for the pnpm monorepo: watch the repo root so changes in
// shared workspace packages (@swap/types, @swap/validation) are picked up, and
// let Metro resolve modules from both the app and the hoisted root store.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = false;

// The shared workspace packages (@swap/types, @swap/validation) are consumed as TS
// source and use TS-ESM import specifiers (e.g. `export * from "./enums.js"`). tsc
// and vitest map `.js` → `.ts`, but Metro does not. Retry a failing relative `.js`
// import without the extension so Metro resolves it to the `.ts`/`.tsx` source.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  if (/^\.\.?\//.test(moduleName) && moduleName.endsWith(".js")) {
    try {
      return resolve(context, moduleName, platform);
    } catch {
      return resolve(context, moduleName.slice(0, -3), platform);
    }
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
