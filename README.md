# ResumeCopilot

人机协同简历编辑软件：左侧结构化 Markdown 编辑，右侧 A4 实时预览；后端提供简历语义 API、PDF 导出与文件监听，Hermes Agent 可通过 Skills 安全改写简历内容。

这个仓库主要用于展示一个从“模板编辑”到“Agent 协作改写”的完整小型工具链。项目没有做成通用 SaaS，重点放在本地可运行、数据结构清晰、编辑体验稳定。

## 功能

- 左侧按 Section 编辑简历内容，右侧实时渲染 A4 预览
- FastAPI 后端管理简历文件、Section 语义操作、PDF 导出和 WebSocket 文件变更通知
- React + TypeScript 前端处理长简历编辑、预览分页和智能缩放策略
- Hermes Skills 提供面向 Agent 的内容改写和模板生成入口
- 示例简历数据可直接用于开发和验证

## 项目结构

```text
ResumeCopilot/
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
cd backend
uv run python test_resume_domain.py
uv run python test_inner_block.py
uv run python test_resume_pdf.py

# 前端
cd frontend
npm ci
npm test
npm run build
```

## API

主要接口包括：`/api/resumes`、`/api/resumes/{name}/content`、Section 语义 API、`/api/resumes/{name}/export-pdf`、`/ws`。

## License

MIT
