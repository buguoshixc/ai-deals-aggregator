# AI 优惠聚合器部署指南

本指南详细说明如何将此项目部署为可通过网址访问的网站。

## 部署选项

### 方案一：GitHub Pages（推荐，免费）

GitHub Pages 是 GitHub 提供的静态网站托管服务，完全免费且自动化。

#### 部署步骤

1. **准备代码**
   ```bash
   # 确保所有更改已提交
   git add .
   git commit -m "feat: ready for GitHub Pages deployment"
   git push origin master
   ```

2. **启用 GitHub Pages**
   - 进入 GitHub 仓库页面
   - 点击 "Settings" → "Pages"
   - 在 "Source" 部分选择 "GitHub Actions"
   - 点击 "Save"

3. **等待自动部署**
   - GitHub Actions 会自动运行 `.github/workflows/deploy.yml`
   - 查看 Actions 标签页了解部署进度

4. **访问网站**
   - 部署完成后，网站地址为：
     ```
     https://[你的用户名].github.io/[仓库名]/
     ```
   - 或自定义域名（如果配置了）

#### 技术细节
- 使用 `.nojekyll` 文件绕过 Jekyll 处理
- 部署前自动运行数据采集脚本
- 每天自动更新数据（根据 collect.yml 配置）

### 方案二：Vercel（简单快捷，免费）

Vercel 提供更简单的部署流程和更好的性能。

#### 部署步骤
1. 访问 [vercel.com](https://vercel.com)
2. 使用 GitHub 账户登录
3. 点击 "New Project"
4. 导入此 GitHub 仓库
5. 保持默认设置，点击 "Deploy"
6. 访问分配的域名：`https://[项目名].vercel.app`

#### 优势
- 自动 HTTPS
- 全球 CDN 加速
- 每次 git push 自动重新部署
- 无服务器函数支持（如有需要）

### 方案三：Netlify（类似 Vercel）

操作流程与 Vercel 类似，也是免费选择。

### 方案四：传统 Web 托管

适用于拥有自有服务器的场景。

#### 部署步骤
1. 将项目文件上传到 Web 服务器
2. 确保 `index.html` 在网站根目录
3. 配置 Web 服务器（Apache/Nginx）以正确处理静态文件
4. 配置域名解析指向服务器 IP
5. 设置 SSL 证书（推荐使用 Let's Encrypt）

## 自动更新机制

项目已配置每日自动更新数据：

- **频率**：每天两次（北京时间 8:00 和 20:00）
- **触发**：GitHub Actions 定时任务
- **流程**：
  1. 运行 `node scripts/collect.js` 抓取最新数据
  2. 更新 `deals.json` 文件
  3. 自动提交并推送到仓库

## 域名配置（可选）

### 使用自定义域名

1. **GitHub Pages**
   - 在域名注册商处添加 CNAME 记录：
     ```
     类型：CNAME
     主机名：www
     目标：[用户名].github.io
     ```
   - 在 GitHub Pages 设置中添加自定义域名

2. **Vercel/Netlify**
   - 在平台设置中添加自定义域名
   - 按照平台指引配置 DNS 记录

## 本地开发与测试

### 启动本地服务器
```bash
# 方法一：Python
python -m http.server

# 方法二：Node.js
npx http-server

# 方法三：VSCode Live Server 扩展
# 右键点击 index.html → "Open with Live Server"
```

### 访问本地预览
- 打开浏览器访问 `http://localhost:8000`
- 或 `http://localhost:8080`

## 故障排除

### 常见问题

1. **404 错误**
   - 确保 `index.html` 在网站根目录
   - 检查 `.nojekyll` 文件是否存在

2. **数据未加载**
   - 检查 `deals.json` 文件是否可访问
   - 查看浏览器控制台错误信息
   - 确保 CORS 策略允许跨域请求

3. **部署失败**
   - 检查 GitHub Actions 日志
   - 确保有足够的 GitHub Actions 配额
   - 验证部署配置是否正确

### 手动触发部署

**GitHub Pages：**
- 进入仓库 Actions 标签页
- 找到 "Deploy to GitHub Pages" workflow
- 点击 "Run workflow" 按钮

**Vercel：**
- 进入 Vercel 控制台
- 点击项目 → "Deployments" → "Redeploy"

## 监控与维护

### 网站状态监控
- **GitHub Pages**：Settings → Pages 查看状态
- **Vercel**：控制台查看部署状态
- **Uptime Robot**：免费网站监控服务

### 数据更新验证
定期检查 `deals.json` 文件更新时间和内容，确保自动更新正常工作。

## 安全建议

1. **不要上传敏感信息**
   - 避免在代码中包含 API 密钥或密码
   - 使用 GitHub Secrets 存储敏感数据

2. **启用 HTTPS**
   - GitHub Pages/Vercel/Netlify 默认提供 HTTPS
   - 传统托管需手动配置 SSL 证书

3. **定期更新依赖**
   ```bash
   npm audit
   npm update
   ```

## 联系方式

如有部署问题，请：
1. 检查本指南相关部分
2. 查看项目 Issues 页面
3. 提交新的 Issue 报告问题

---

**最后更新：** 2026-09-20  
**部署状态：** 配置完成，待推送后生效