# AI 优惠聚合器 - 执行计划

## 目标
创建一个轻量级的 AI 优惠信息聚合网页，每天自动抓取并展示最新的 AI 产品折扣和福利信息，供个人使用。

## 技术方案
- **前端**: 单页 HTML + 内嵌 CSS/JS，直接读取 JSON 数据文件
- **数据采集**: Node.js 爬虫脚本，抓取 2-3 个结构化数据源
- **自动化**: GitHub Actions 定时任务（每天运行 1-2 次）
- **部署**: GitHub Pages（免费，自动更新）
- **数据存储**: `deals.json` 文件（Git 仓库内，自带版本历史）

## 数据源（MVP 阶段）
1. **Product Hunt** - AI 分类的新品和优惠
2. **AppSumo** - AI 产品折扣区
3. **备选**: Toolify.ai 或其他 AI 导航站

## 实施步骤

### Step 1: 初始化项目结构
创建项目基础文件和目录：
- `index.html` - 主页面
- `deals.json` - 数据文件（初始为空数组）
- `scripts/collect.js` - 爬虫入口脚本
- `scripts/collectors/` - 各数据源的采集器
- `.github/workflows/collect.yml` - GitHub Actions 定时任务配置
- `package.json` - 依赖管理（cheerio, axios 等）

### Step 2: 编写数据采集脚本
为每个数据源编写独立的采集器模块：
- `scripts/collectors/producthunt.js` - 抓取 Product Hunt AI 分类
- `scripts/collectors/appsumo.js` - 抓取 AppSumo AI 折扣区
- `scripts/collect.js` - 主入口，协调各采集器，合并去重，写入 `deals.json`

每条优惠数据结构：
```json
{
  "title": "优惠标题",
  "url": "链接",
  "source": "来源网站",
  "discount": "折扣信息",
  "description": "简短描述",
  "category": "分类",
  "date": "2026-09-20",
  "endDate": "截止日期（可选）"
}
```

### Step 3: 构建前端页面
编写 `index.html`，功能包括：
- 读取 `deals.json` 并渲染列表
- 每条优惠显示：标题、来源、折扣、日期、链接
- 客户端搜索框（基于标题和描述过滤）
- 分类筛选下拉框
- 过期优惠自动变灰或折叠
- 简洁美观的响应式布局

### Step 4: 配置 GitHub Actions 自动化
编写 `.github/workflows/collect.yml`：
- 使用 cron 定时触发（每天北京时间早 8 点和晚 8 点）
- 支持手动触发（workflow_dispatch）
- 执行流程：checkout → npm install → node scripts/collect.js → git commit & push
- 如果数据无变化则不 commit

### Step 5: 部署到 GitHub Pages
- 在 GitHub 创建仓库并推送代码
- 在仓库设置中启用 GitHub Pages
- 配置自定义域名（可选）

### Step 6: 测试和验证
- 手动运行爬虫脚本，验证数据抓取正确
- 本地打开 `index.html` 验证页面渲染
- 触发 GitHub Actions 验证自动化流程
- 确认 GitHub Pages 可访问且自动更新

## 关键文件清单
- `index.html` - 前端页面
- `deals.json` - 数据文件
- `scripts/collect.js` - 采集主脚本
- `scripts/collectors/producthunt.js` - Product Hunt 采集器
- `scripts/collectors/appsumo.js` - AppSumo 采集器
- `.github/workflows/collect.yml` - 自动化配置
- `package.json` - 项目依赖

## 预估时间
- Step 1-3: 2-3 小时（项目搭建 + 爬虫 + 页面）
- Step 4-5: 30 分钟（自动化配置 + 部署）
- Step 6: 30 分钟（测试验证）
- **总计**: 约 3-4 小时完成 MVP

## 后续优化方向（可选）
- 添加更多数据源
- 邮件/Telegram 推送通知
- 优惠详情页
- 用户手动提交功能
- 数据去重和质量过滤