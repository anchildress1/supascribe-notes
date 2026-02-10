import type { Config } from './config.js';
import { loadConfig } from './config.js';
import { createApp } from './server.js';

const config: Config = loadConfig();
const app = createApp(config);

const port = config.port;
app.listen(port, () => {
  console.log(`🚀 Supascribe MCP server listening on port ${port}`);
});
