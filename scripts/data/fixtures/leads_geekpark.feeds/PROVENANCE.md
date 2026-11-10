# fixture 出处：leads_geekpark.feeds

| 项 | 值 |
|---|---|
| 来源页面 | https://www.geekpark.net/rss |
| 采集器 | `leads_geekpark`（极客公园） |
| 抓取日期 | 2026-11-10 |
| 保留的内容 | 解析器/判据真正读的四个字段（title / link / pubDate / description）：三闸全中与近失配条目优先，最多 8 条，description 截到 200 字 |
| 片段文件 | `page.min.xml` |
| 片段体积 | 6215 字节（上限 20480） |
| 片段解析条数 | 8 |
| 同规则整页解析条数 | 30 |

## 为什么要这个文件

盘古之白一样的道理：一份测试数据如果说不清"从哪来、裁掉了什么、为什么这么裁"，
半年后就没人敢改它了。这里只保留**解析器真正读的那些节点**，
页面正文（介绍文案、导航、页脚）全部裁掉 —— 既有体积的原因，也有版权的原因：
第三方页面的正文不该成批进入我们的仓库，而我们需要的只是"结构还在不在"。

## 版权

片段来自公开页面，仅保留为验证解析器所必需的**结构与最小文本**（表格单元格、卡片标题）。
如权利人提出异议，删除对应目录即可 —— `scripts/tools/fixture-test.js` 会跳过缺失的 fixture，
解析器本身不依赖它运行。

## 怎么重建

```bash
node scripts/tools/build-fixtures.js --source=leads_geekpark
node scripts/tools/fixture-test.js
```

重建会随官方页面变化而变化，所以**重建后要看 diff 再提交**：
只在"页面真的变了"时才该有变化；如果没动页面而 diff 变了，那是解析器行为变了。
