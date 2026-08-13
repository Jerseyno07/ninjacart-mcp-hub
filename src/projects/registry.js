import { register as registerPacktrack } from './packtrack/index.js';

// THE ONE FILE touched to plug in a new project's tools — add an import and
// a register(...) call here. Nothing else in src/auth, src/mcp, src/knowledge,
// or src/server.js needs to change.
export function registerAllProjects(mcpServer) {
  registerPacktrack(mcpServer);
}
