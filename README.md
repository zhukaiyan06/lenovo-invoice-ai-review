# 联想渠道发票报备 AI 辅助审核系统

这是一个可真实操作的 Web Demo。后台审核员可以根据 AI 异常线索核对发票原件、OCR 原值与 L2 提交值，人工通过或驳回，并撤回自己的审批决议；后台主管可以查看全员审批历史并撤回任意审核员的决议。业务字段、OCR 原值、AI 标签、审批结果和操作日志均由后端持久化。

## 技术栈

- 前端：Vue 3、Vite、TypeScript、Vant
- 后端：NestJS、Prisma、SQLite
- OCR：可替换的 `OcrProvider`，Demo 默认使用本地 provider
- 测试：Vitest、Playwright

## 环境要求

- Node.js 20 或更高版本
- npm 10 或更高版本
- Google Chrome（Playwright 主流程测试使用本机 Chrome）

## 首次启动

在项目根目录执行：

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

启动成功后访问：

- Web 应用：`http://127.0.0.1:5173/`
- 后端健康检查：`http://127.0.0.1:3000/api/health`

前端和后端必须同时运行。SQLite 数据库位于 `backend/prisma/dev.db`，上传文件保存在 `backend/uploads/`。

## 本地账号

所有账号密码均为 `demo123`。

| 账号 | 角色 | 登录后页面 |
|---|---|---|
| `l2-a` | L2 报备用户 | 我的发票报备 |
| `l2-b` | L2 报备用户 | 我的发票报备 |
| `auditor-a` | 审核员 | 待审队列 |
| `auditor-b` | 审核员 | 待审队列 |
| `supervisor` | 主管 | 待审队列 |

## 样票

仓库提供 PNG 样票：

- `发票示例.png`
- `frontend/src/assets/demo-invoices/standard-lenovo-invoice.png`

上传普通样票后，系统会通过真实 multipart 请求保存文件，并由后端 OCR provider 初始化发票字段和三行商品明细。

## L2 主流程

1. 使用 `l2-a / demo123` 登录。
2. 点击“新建发票报备”，选择样票并上传。
3. 检查 OCR 预填字段，填写“出货时间”和每行“产品具体型号”。
4. 点击“保存草稿”，刷新页面确认数据仍然存在。
5. 点击“提交审核”，后端执行必填校验和 AI 打标。
6. 提交后字段锁定，状态进入“待人工审批-正常”或“待人工审批-异常”。

## AI 规则复现

- 正常：不修改关键金额，补齐必填字段后提交。
- 关键字段修改：提交前修改“价税合计”，触发 `KEY_FIELD_MODIFIED`。
- 重复发票：提交两张发票号相同的报备单，第二张触发 `DUPLICATE_INVOICE`。
- 统一代码补录：上传文件名包含 `missing-buyer-code` 或 `missing-seller-code` 的文件，补录代码后提交。
- OCR 失败：上传文件名包含 `ocr-failed` 的文件，人工补齐字段和商品明细后提交。

这些文件名只控制本地 OCR provider 返回的识别结果，用户仍然需要经过真实上传、编辑和提交操作。

## 后台审核 Demo

登录页提供审核员 A、审核员 B、后台主管三个快捷入口。启动后自动准备 8 条后台演示数据；每次后端重新启动时，这 8 条数据会复位，不影响其他用户创建的数据。

### 演示流程一：AI 异常单通过

1. 点击“审核员 A”快捷入口。
2. 在待审队列打开 `admin-demo-1`。
3. 查看 AI 异常原因，以及价税合计 `104400.00 → 105400.00` 的关键字段差异。
4. 点击“通过并归档”，状态进入“已锁定 / 审核归档”，审批动作写入操作日志。

### 演示流程二：重复发票驳回

1. 返回待审队列，打开 `admin-demo-2`。
2. 查看“重复发票”异常线索。
3. 点击“驳回”，填写明确原因并确认，状态进入“已驳回”。

### 演示流程三：撤回审批决议

1. 审核员 A 在“我的处理历史”打开自己处理的单据并撤回，状态回到“待 L2 确认”。
2. 切换为后台主管，进入“全员审批历史”。
3. 打开审核员 B 处理的单据并撤回，状态回到“待 L2 确认”。
4. 两次撤回均追加 `WITHDRAW_REVIEW` 操作日志；审核员直接撤回他人决议会被后端拒绝。

## 自动化验证

运行全部测试：

```bash
npm run test
```

该命令依次执行：

- 规则单元测试：正常、OCR 失败、统一代码补录、金额修改、重复发票。
- API 集成测试：登录、RBAC、审核队列、驳回原因、通过、个人/全员历史、审核员与主管撤回权限、撤回日志。
- Playwright：后台连续完成差异核验与通过、重复发票驳回、审核员本人撤回、主管跨审核员撤回；原 L2 端到端流程继续保留。

API 集成测试使用临时 SQLite 数据库，不污染 Demo 数据。Playwright 会在 Demo 数据库新增一条 `E2E-*` 已归档报备记录。

可单独运行：

```bash
npm run test:backend
npm run test:e2e
npm run build
```

测试失败时，Playwright trace 和截图位于 `test-results/`，HTML 报告位于 `playwright-report/`。

## 工程结构

```text
.
├── backend/                  # NestJS API、Prisma schema、迁移和 Vitest
├── e2e/                      # Playwright 主流程
├── frontend/                 # Vue 3 用户端与审核端
├── playwright.config.ts
├── 联想渠道发票报备AI辅助审核系统-PRD-v1.0.md
└── 联想渠道发票报备AI辅助审核系统-Demo实施计划.md
```
