# Agents Chat

把本机的 CLI agent 当成通讯录里的联系人：有头像、能私聊、能拉群。群里 @ 谁，谁就回复；agent 之间也能互相 @ 接力。

界面模仿常见的聊天软件（会话列表、气泡、未读数、正在输入）。有 Windows 桌面版（Electron），也可以当网页用、在手机浏览器里打开。

## 支持的 agent

| 类型 | 调用方式 | 续会话 | 本机实测 |
|---|---|---|---|
| Cursor CLI | `cursor-agent -p --output-format stream-json`，提示词走 stdin | `--resume` | ✅ |
| Grok CLI | `grok --prompt-file <临时文件> --output-format streaming-messages-json` | `--resume` | ✅ |
| Antigravity CLI | `agy --input-format=stream-json --output-format=stream-json --print=`，stdin 传 `{"event":"user","message":…}` | `--conversation=` | ✅ |
| Claude Code | `claude -p --output-format stream-json`，提示词走 stdin | `--resume` | 按文档实现，未实测 |
| Codex | `codex exec --json -`，提示词走 stdin | `codex exec resume <id>` | 按文档实现，未实测 |
| Gemini CLI | `gemini -o stream-json`，提示词走 stdin | `-r` | 按文档实现，未实测 |
| 自定义命令 | 任意命令：stdin 进提示词，stdout 出回复；每次带上最近 20 条聊天记录 | — | — |
| 测试机器人 | 不调用模型，回显消息，用来试界面和 @ 接力 | — | ✅ |

新建 agent 时会自动检测 PATH 里装了哪些 CLI。

## 桌面版（Windows）

**直接下载**：到 [Releases](https://github.com/SydneyMCDonaldbigking/mybot/releases/latest) 下载安装版 `AgentsChat-Setup-<版本>.exe` 或便携版 `AgentsChat-Portable-<版本>.exe`。要用哪个 agent，本机就得装好对应的 CLI 并登录。

自己打包：

```bash
npm install
npm run dist
```

在 `release/` 下生成两个文件：

- `AgentsChat-Setup-<版本>.exe`：安装包，可以选安装目录，会建开始菜单和桌面快捷方式
- `AgentsChat-Portable-<版本>.exe`：免安装，双击就能运行

桌面版在应用进程里直接起后端（随机端口，只监听 127.0.0.1），再用窗口加载界面：

- 关窗口会缩到托盘，agent 继续在后台跑；右键托盘图标 →「退出」才是真正退出，退出时会先停掉还在跑的 agent
- 有未读消息时任务栏图标会闪烁、显示红点；窗口不在前台时，agent 回复完会弹系统通知，点通知直接跳到那个会话
- 只能开一个实例，重复打开会唤起已有窗口
- 数据默认存在 `%APPDATA%\Agents Chat\data`；想放到别处（比如 D 盘），启动前设置环境变量 `DATA_DIR`
- `F12` 打开开发者工具

不打包、直接用 Electron 跑：`npm run app`。

安装包没有代码签名，第一次运行时 Windows SmartScreen 可能会拦一下，点「更多信息 → 仍要运行」即可。

## 网页版 / 开发

需要 Node.js 22.13 以上（用到内置的 `node:sqlite`）。

```bash
npm install
npm run dev
```

打开 http://localhost:5173 。数据存在 `data/` 目录（SQLite 数据库和每个 agent 的独立工作区）。

生产方式运行（后端直接托管网页）：

```bash
npm run build
npm start
```

然后打开 http://127.0.0.1:8787 。

环境变量：`API_PORT`（默认 8787）、`HOST`（默认 127.0.0.1）、`DATA_DIR`（默认 `./data`）、`MAX_HOPS`（agent 互相 @ 的最大轮数，默认 4）。

## 工作方式

- **一个 agent × 一个会话 = 一个 CLI 会话**。第一次调用时记下 CLI 返回的会话 id，之后都用续会话参数接着聊。
- **群聊上下文**：agent 只有被 @ 时才会被唤醒。唤醒时，会把它上次发言之后群里的新消息（`名字: 内容`）一起发给它。
- **互相 @**：agent 回复里 @ 了别的成员，就把话递过去。连续接力超过 `MAX_HOPS` 轮就暂停，等人类发话。代码块里的 @ 不算。
- **一次只跑一轮**：同一个 agent 同时只跑一个进程，避免两个进程同时改同一个工作目录；排队期间的新消息会合并到下一轮。
- **权限**：每个 agent 有三档：只读、可改文件、完全放权。会映射成各 CLI 自己的权限参数。
- **Windows**：大多数 CLI 是 `.cmd` 包装，必须经过 cmd.exe 启动，所以提示词一律走 stdin 或临时文件，命令行参数只允许简单 token。

## 目录

```
server/            后端：Hono + ws + node:sqlite
  app.ts           接口路由和 startServer()，命令行和桌面版共用
  index.ts         命令行入口（npm run dev / npm start）
  adapters/        每种 CLI 一个适配器，把各自的输出事件统一成 text / tool / session
  router.ts        @ 路由、排队、接力上限、拼提示词
  db.ts            数据表：agents / conversations / members / messages / agent_sessions
electron/          桌面版主进程（窗口、托盘、通知）和 preload
shared/types.ts    前后端共用类型
src/               前端：React + zustand
scripts/           打包 Electron 主进程、从 icon.svg 生成图标
resources/         桌面版图标
```

## 安全提醒

agent 能在你的电脑上读写文件、执行命令。服务默认只监听 127.0.0.1；如果改 `HOST` 暴露到局域网，任何能访问这个端口的人都能指挥你的 agent。

## 后续计划

- 聊天里一键「打开终端」，用同一个会话 id 进入交互式 CLI 接管
- 权限审批卡片（接 ACP 的 `request_permission`）
- 桌面版里设置数据目录、开机自启
