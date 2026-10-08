# TokenHub：模型价格（逐字片段）

抓取日：2026-10-08（Asia/Shanghai）

本文件是**逐字片段**；完整 HTML 原件按 `docs/EVIDENCE-POLICY.md` 不入库，本机保留。

URL：<https://cloud.tencent.com/document/product/1823/130055>

## 本机快照（不入库）

| 文件 | 字节 | sha256（前 16） | URL |
|---|---|---|---|
| `hunyuan-1729-97731-legacy.html` | 49933 | `0621021f1667b906` | <https://cloud.tencent.com/document/product/1729/97731> |
| `tokenhub-1823-130054-billing.html` | 57212 | `8c4803b901ef8828` | <https://cloud.tencent.com/document/product/1823/130054> |
| `tokenhub-1823-130055-model-price.html` | 180293 | `a668ed2ed66534fd` | <https://cloud.tencent.com/document/product/1823/130055> |
| `tokenhub-1823-130051-model-list.html` | 123186 | `b144c8eb765f8d44` | <https://cloud.tencent.com/document/product/1823/130051> |
| `tokenhub-1823-130053-free-trial.html` | 52703 | `cf0a65a9c9acb8f6` | <https://cloud.tencent.com/document/product/1823/130053> |
| `tokenhub-1823-131382-migration-guide.html` | 51643 | `1b2e58d1479770a7` | <https://cloud.tencent.com/document/product/1823/131382> |
| `tencent-announce-2287-migration.html` | 28837 | `4cea3e4db0567444` | <https://cloud.tencent.com/announce/detail/2287> |

## 页面自报更新时间

```
最近更新时间：
2026-09-24 20:08:15
本文档已由 AI 辅助审校
```

## 语言模型 · 广州 tab（HTML 里 `tse-tabs__item is-active` 是「广州」）

```
按 Token 计费（后付费）
广州
新加坡
模型名称
条件
（token）
峰谷计费
推理输入
（元/百万 tokens）
推理输出
（元/百万 tokens）
缓存命中
（元/百万 tokens）
Hy4 preview
-
-
6
18
0.3
Hy3
-
-
1
4
0.25
Hy-MT2-Pro
-
-
0.5
2
-
Hy-MT2-Plus
-
-
0.5
2
-
Hy-MT2-Lite
-
-
0.3
1.2
-
Hy-Role-Latest
-
-
2.4
9.6
-
Hy-Role
-
-
2.4
9.6
-
DeepSeek-V4.1-Flash 原厂直供
-
空闲时段
1
4
0.02
高峰时段
2
8
0.04
DeepSeek-V4-Flash 0731 正式版 原厂直供
-
空闲时段
1
4
0.02
高峰时段
2
8
0.04
DeepSeek-V4-Pro 0813 正式版 原厂直供
-
空闲时段
4.5
13.5
0.15
高峰时段
9
27
0.3
DeepSeek-V4-Flash-Vision-Exp 原厂直供
-
空闲时段
1
4
0.02
高峰时段
2
8
0.04
DeepSeek-V4-Flash 0731 正式版
-
空闲时段
1.5
4.5
0.05
高峰时段
3
9
0.1
DeepSeek-V4-Pro 0813 正式版
-
空闲时段
4.5
13.5
```

## 语言模型 · 新加坡 tab（文档顺序里的第二张语言模型表；**没有 Hy-Role-Latest / Hy-Role 行**）

```
模型名称
条件
（token）
峰谷计费
推理输入
（元/百万 tokens）
推理输出
（元/百万 tokens）
缓存命中
（元/百万 tokens）
Hy4 preview
-
-
6
18
0.3
Hy3
-
-
1
4
0.25
Hy-MT2-Plus
-
-
0.5
2
-
DeepSeek-V4.1-Flash 原厂直供
-
空闲时段
1
4
0.02
高峰时段
2
8
0.04
DeepSeek-V4-Flash 0731 正式版 原厂直供
-
```

## 多模态理解模型（逐字）

```
多模态理解模型
模型名称
推理输入（元/百万 tokens）
推理输出（元/百万 tokens）
YT-VITA
1.2
3.5
HY-Vision-2.0-Instruct
7.5
17.5
HY-Vision-1.5-Thinking
3
9
HY-Vision-Video
3
9
向量模型
模型名称
计费项
价格（元/百万 tokens）
```

## 向量模型（逐字）

```
Kinfra-Text-Embedding-0.6b
文本输入
0.5
Kinfra-Text-Embedding-4b
文本输入
0.6
Kinfra-VL-Embedding-2b
文本输入
0.5
图片输入
0.7
视频输入
1.5
Kinfra-VL-Embedding-8b
文本输入
0.6
图片输入
0.9
视频输入
1.8
说明：
多模态向量模型的文本、图片和视频输入 token 数可通过响应中的
usage.prompt_tokens_details.text_tokens
、
```

