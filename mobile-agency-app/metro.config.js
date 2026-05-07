const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [path.resolve(monorepoRoot, 'shared')];

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  '@shared': path.resolve(monorepoRoot, 'shared'),
};

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
];

module.exports = config;
