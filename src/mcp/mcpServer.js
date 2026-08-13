import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllProjects } from '../projects/registry.js';

// A `McpServer`/`Protocol` instance can only be connected to one transport at
// a time (the SDK throws "Already connected to a transport" on a second
// connect()) — so instead of one shared singleton, this is a factory that
// builds a fresh, fully-registered server for each new session. All project
// tool registration still happens through the one registerAllProjects() path
// in src/projects/registry.js, so adding a project is still a one-file change.
export function createMcpServer() {
  const server = new McpServer({
    name: 'ninjacart-mcp-hub',
    version: '0.1.0',
  });
  registerAllProjects(server);
  return server;
}
