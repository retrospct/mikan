if (process.env.npm_config_user_agent?.includes('pnpm')) process.exit(0);
require('electron-builder/out/cli/install-app-deps').installAppDeps({disableRebuild: true});
