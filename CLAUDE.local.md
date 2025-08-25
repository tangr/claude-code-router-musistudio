# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Router Service Commands

- **Build the project**:

  ```bash
  npm run build
  ```

- **Start the router server**:

  ```bash
  ccr start
  ```

- **Stop the router server**:

  ```bash
  ccr stop
  ```

- **Restart the router server**:

  ```bash
  ccr restart
  ```

- **Check the server status**:

  ```bash
  ccr status
  ```

- **Run Claude Code through the router**:

  ```bash
  ccr code "<your prompt>"
  ```

- **Open web UI**:

  ```bash
  ccr ui
  ```

- **StatusLine integration** (for terminal status display):

  ```bash
  ccr statusline
  ```

- **Release a new version**:

  ```bash
  npm run release
  ```

### UI Development Commands

The project includes a React-based web UI in the `ui/` directory:

- **Start UI development server**:

  ```bash
  cd ui && npm run dev
  ```

- **Build UI for production**:

  ```bash
  cd ui && npm run build
  ```

- **Lint UI code**:

  ```bash
  cd ui && npm run lint
  ```

## Architecture

This project is a TypeScript-based router for Claude Code requests. It consists of two main components: a Node.js router service and a React-based web UI.

### Core Router Service

- **Entry Point**: The main command-line interface logic is in `src/cli.ts`. It handles parsing commands like `start`, `stop`, `restart`, `code`, and `ui`.
- **Server**: The `ccr start` command launches a Fastify server that listens for requests from Claude Code. The server logic is initiated from `src/index.ts` and configured in `src/server.ts`.
- **Configuration**: The router is configured via a JSON file located at `~/.claude-code-router/config.json`. This file defines API providers, routing rules, and custom transformers. Development config example is in `config-dev.json`.
- **Authentication**: API key authentication is handled by middleware in `src/middleware/auth.ts`. Set APIKEY in config or use HOST=127.0.0.1 for local-only access.

### Routing Logic

The core routing system in `src/utils/router.ts` provides intelligent model selection:

- **Token-based routing**: Automatically switches to longContext models when requests exceed 60,000 tokens
- **Scenario-based routing**: Supports different models for `default`, `background`, `think`, `longContext`, and `webSearch` scenarios
- **Custom routing**: Supports custom JavaScript router files via CUSTOM_ROUTER_PATH configuration
- **Subagent support**: Handles `<CCR-SUBAGENT-MODEL>` tags for dynamic model switching within conversations
- **Session management**: Tracks usage across sessions with caching in `src/utils/cache.ts`

### Web UI

- **Technology Stack**: React + TypeScript + Vite + Tailwind CSS + shadcn-ui components
- **Build Output**: Single HTML file with inlined assets for easy deployment
- **Features**: Provider configuration, router rules management, transformer setup, authentication
- **Internationalization**: Supports English and Chinese via i18next
- **API Integration**: Custom API client in `ui/src/lib/api.ts` handles communication with router service

### Service Management

- **Process Management**: Automatic PID file handling in `src/utils/processCheck.ts`
- **Logging**: Configurable logging with rotation via pino-rotating-file-stream
- **Updates**: Built-in update checking and management system
- **StatusLine**: Terminal status line integration for IDE compatibility

### Key Dependencies

- **@musistudio/llms**: Core LLM interaction library based on Fastify
- **tiktoken**: Token counting for routing decisions
- **fastify**: Web server framework with hook system support
- **esbuild**: Build tool for TypeScript compilation

### Development Workflow

1. **Configuration**: Copy `config-dev.json` to `~/.claude-code-router/config.json` and configure providers
2. **Local Development**: Run `ccr start` to launch the service, `ccr ui` to access web interface
3. **UI Development**: Use `cd ui && npm run dev` for frontend development with hot reload
4. **Testing**: Use `ccr code "test prompt"` to test routing behavior
5. **Debugging**: Check logs in `~/.claude-code-router/logs/` directory

## Important Notes

- 无论如何你都不能自动提交 git (Never automatically commit to git)
- The service auto-starts when using `ccr code` or `ccr ui` if not already running
- Configuration changes require service restart to take effect
- Default port is 3456, configurable via PORT in config
