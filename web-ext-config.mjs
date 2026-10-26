// Config for web-ext (lint/build/run). Only extension files go into the zip.
export default {
  ignoreFiles: [
    'package.json',
    'package-lock.json',
    'web-ext-config.mjs',
    'node_modules',
    'scripts',
    'test',
    'web-ext-artifacts',
    '*.zip',
    'README.md',
    'CLAUDE.md',
  ],
  build: {
    overwriteDest: true,
  },
};
