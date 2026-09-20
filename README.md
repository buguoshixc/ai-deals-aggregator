# AI 优惠聚合器

一个轻量级的 AI 优惠信息聚合网页，每天自动抓取并展示最新的 AI 产品折扣和福利信息。

## 功能特性

- ✅ 自动抓取多个 AI 工具目录站的优惠信息
- ✅ 实时展示 50+ 条 AI 产品折扣
- ✅ 支持搜索和分类筛选
- ✅ 响应式设计，支持移动设备
- ✅ 自动定时更新（每天两次）

## 数据来源

- aitools.fyi
- Futurepedia  
- Futuretools

## 技术栈

- HTML/CSS/JavaScript (前端)
- Node.js (数据采集)
- GitHub Actions (自动化)
- GitHub Pages (部署)

## 更新机制

系统每天在北京时间早上 8 点和晚上 8 点自动运行，抓取最新优惠信息并更新页面。

## 本地开发

```bash
# 安装依赖
npm install

# 运行数据采集
node scripts/collect.js
```

## 隐私声明

本项目仅供个人使用，不收集任何用户数据。