# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此代码库中工作时提供指导。

## 命令

### 路由服务命令

- **构建项目**:

  ```bash
  npm run build
  ```

- **启动路由服务器**:

  ```bash
  ccr start
  ```

- **停止路由服务器**:

  ```bash
  ccr stop
  ```

- **重启路由服务器**:

  ```bash
  ccr restart
  ```

- **检查服务器状态**:

  ```bash
  ccr status
  ```

- **通过路由运行 Claude Code**:

  ```bash
  ccr code "<your prompt>"
  ```

- **打开网页界面**:

  ```bash
  ccr ui
  ```

- **状态栏集成** (用于终端状态显示):

  ```bash
  ccr statusline
  ```

- **发布新版本**:

  ```bash
  npm run release
  ```

### UI 开发命令

项目在 `ui/` 目录中包含基于 React 的网页界面：

- **启动 UI 开发服务器**:

  ```bash
  cd ui && npm run dev
  ```

- **构建生产环境 UI**:

  ```bash
  cd ui && npm run build
  ```

- **检查 UI 代码规范**:

  ```bash
  cd ui && npm run lint
  ```

## 架构

本项目是一个基于 TypeScript 的 Claude Code 请求路由器。它包含两个主要组件：Node.js 路由服务和基于 React 的网页界面。

### 核心路由服务

- **入口点**: 主要的命令行界面逻辑在 `src/cli.ts` 中。它处理解析 `start`、`stop`、`restart`、`code` 和 `ui` 等命令。
- **服务器**: `ccr start` 命令启动一个 Fastify 服务器，监听来自 Claude Code 的请求。服务器逻辑从 `src/index.ts` 启动，在 `src/server.ts` 中配置。
- **配置**: 路由器通过位于 `~/.claude-code-router/config.json` 的 JSON 文件进行配置。此文件定义 API 提供商、路由规则和自定义转换器。开发配置示例在 `config-dev.json` 中。
- **身份验证**: API 密钥身份验证由 `src/middleware/auth.ts` 中的中间件处理。在配置中设置 APIKEY 或使用 HOST=127.0.0.1 进行本地访问。

### 路由逻辑

`src/utils/router.ts` 中的核心路由系统提供智能模型选择：

- **基于令牌的路由**: 当请求超过 60,000 个令牌时自动切换到 longContext 模型
- **基于场景的路由**: 支持 `default`、`background`、`think`、`longContext` 和 `webSearch` 场景的不同模型
- **自定义路由**: 通过 CUSTOM_ROUTER_PATH 配置支持自定义 JavaScript 路由文件
- **子代理支持**: 处理 `<CCR-SUBAGENT-MODEL>` 标签，用于对话中的动态模型切换
- **会话管理**: 通过 `src/utils/cache.ts` 中的缓存跟踪跨会话使用情况

### 网页界面

- **技术栈**: React + TypeScript + Vite + Tailwind CSS + shadcn-ui 组件
- **构建输出**: 单个 HTML 文件，内联资源便于部署
- **功能**: 提供商配置、路由规则管理、转换器设置、身份验证
- **国际化**: 通过 i18next 支持英文和中文
- **API 集成**: `ui/src/lib/api.ts` 中的自定义 API 客户端处理与路由服务的通信

### 服务管理

- **进程管理**: `src/utils/processCheck.ts` 中的自动 PID 文件处理
- **日志记录**: 通过 pino-rotating-file-stream 进行可配置的日志轮转
- **更新**: 内置更新检查和管理系统
- **状态栏**: 终端状态栏集成，兼容 IDE

### 关键依赖

- **@musistudio/llms**: 基于 Fastify 的核心 LLM 交互库
- **tiktoken**: 用于路由决策的令牌计数
- **fastify**: 支持钩子系统的网络服务器框架
- **esbuild**: TypeScript 编译构建工具

### 开发工作流程

1. **配置**: 将 `config-dev.json` 复制到 `~/.claude-code-router/config.json` 并配置提供商
2. **本地开发**: 运行 `ccr start` 启动服务，`ccr ui` 访问网页界面
3. **UI 开发**: 使用 `cd ui && npm run dev` 进行前端开发和热重载
4. **测试**: 使用 `ccr code "测试提示"` 测试路由行为
5. **调试**: 检查 `~/.claude-code-router/logs/` 目录中的日志

## 动态 API 密钥支持

claude-code-router 现在支持从客户端请求头动态获取 ANTHROPIC_AUTH_TOKEN，使其能够作为多用户服务端使用。

### 启用动态 API 密钥模式

在配置文件中设置：

```json
{
  "DYNAMIC_API_KEY": true,
  "HOST": "0.0.0.0",
  "PORT": 3456
}
```

### 客户端使用方法

客户端发送请求时，需要在 HTTP 头中包含 ANTHROPIC_AUTH_TOKEN：

```bash
# 使用Authorization头
curl -X POST http://your-server:3456/v1/messages \
  -H "Authorization: Bearer sk-ant-your-token-here" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-3-5-sonnet-20241022","messages":[{"role":"user","content":"Hello"}]}'

# 或使用x-api-key头
curl -X POST http://your-server:3456/v1/messages \
  -H "x-api-key: sk-ant-your-token-here" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-3-5-sonnet-20241022","messages":[{"role":"user","content":"Hello"}]}'
```

### 工作原理

1. 启用 `DYNAMIC_API_KEY: true` 后，认证中间件会跳过静态 API 密钥验证
2. 路由中间件会从请求头中提取 ANTHROPIC_AUTH_TOKEN
3. 动态地将提取的 token 应用到相应的 provider 配置中
4. 每个请求都可以使用不同的 API 密钥，实现多用户支持

## 重要说明

- 无论如何你都不能自动提交 git
- 使用 `ccr code` 或 `ccr ui` 时，如果服务未运行会自动启动
- 配置更改需要重启服务才能生效
- 默认端口为 3456，可通过配置中的 PORT 进行配置
- 代码注释使用英文
