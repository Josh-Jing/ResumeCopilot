# ResumeCopilot

人机协同简历编辑软件：左侧 Markdown 分屏编辑，右侧 A4 实时预览；Hermes Agent 通过 Skills 与后端语义 API 安全改写简历内容。

本仓库是对 Hermes 初版的重构，主要改进：

- **正式环境单端口部署**：`npm run build` 构建前端，由 FastAPI 托管静态资源，不再用 `npm run dev` 当生产入口
- **编辑器稳定性**：`SectionEditor` 本地草稿 + `React.memo` 结构共享，避免长简历编辑时滚动条跳动
- **WebSocket 去抖**：忽略自身保存触发的 `file_changed`，减少无意义重载

## 项目结构

```text
ResumeCopilot-cursor/
├── backend/           # FastAPI + Section v2 语义 API + PDF 导出
├── frontend/          # React + Vite + TypeScript
├── examples/resumes/  # 示例简历（开发模式默认数据目录）
├── hermes-skill/      # Hermes Skills（独立交付，不打包进 Web）
└── scripts/           # 启动与 Skill 安装脚本
```

## 快速开始

### 正式使用（推荐）

构建前端并由后端在同一端口提供 UI + API：

```bash
./scripts/start-prod.sh
```

浏览器访问：`http://127.0.0.1:8901`

数据目录：`~/.resume-copilot/resumes`（可通过 `RESUME_COPILOT_HOME` 覆盖）

### 开发 / TDD

热重载后端 + Vite 开发服务器，直接读写仓库内 `examples/`：

```bash
./scripts/start-dev.sh
```

| 用途 | 前端 | 后端 | 数据 |
|---|---|---|---|
| 正式 | `:8901`（静态构建） | `:8901` | `~/.resume-copilot` |
| 开发 | `:5174` | `:8911` | `examples/` |

## 手动启动

```bash
# 正式：先构建，再启动后端
cd frontend && npm ci && npm run build
cd ../backend
FRONTEND_DIST=../frontend/dist SERVE_FRONTEND=true \
  uv run uvicorn main:app --host 127.0.0.1 --port 8901

# 开发：两个终端
RESUME_COPILOT_HOME=../examples uv run uvicorn main:app --host 127.0.0.1 --port 8911 --reload
VITE_RESUME_COPILOT_BACKEND=http://127.0.0.1:8911 npm run dev -- --port 5174
```

## Section v2 数据模型

每份简历三文件：`template.html`、`content.json`、`meta.json`。

```json
{
  "version": 2,
  "sections": {
    "name": { "id": "name", "title": "姓名", "content": "候选人姓名" },
    "contact": { "id": "contact", "title": "联系方式", "content": "- 📱 ..." },
    "sec_A8kL2mQp": { "id": "sec_A8kL2mQp", "title": "项目经历", "content": "## ..." }
  },
  "section_order": ["sec_A8kL2mQp"]
}
```

- 特殊 Section 固定 ID：`name`、`contact`、可选 `photo`
- 普通 Section：`sec_<8位字母数字>`，`section_order` 只含普通 Section

## Hermes Skills

```bash
./scripts/install-hermes-skills.sh        # 复制安装
./scripts/install-hermes-skills.sh --link # 开发 symlink
```

## 验证

```bash
# 后端
cd backend && uv run python test_resume_domain.py

# 前端
cd frontend && npm ci && npm test && npm run build
```

## API

与架构方案一致：`/api/resumes`、`/api/resumes/{name}/content`、Section 语义 API、`/api/resumes/{name}/export-pdf`、`/ws`。

设计文档见：`/Users/jqf/Documents/sidian-OhBedrock/Projects/ResumeCopilot/`
