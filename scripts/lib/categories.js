/**
 * 固定分类枚举与自由文本 → 枚举 的映射表。
 * 契约：deals.json 中每一条 category 必须是 CATEGORIES 中的值。
 */

const CATEGORIES = [
  '对话模型',
  '图像绘画',
  '视频',
  '音频语音',
  '编程开发',
  '办公效率',
  'API服务',
  '智能体',
  '搜索研究',
  '设计创意',
  '教育学习',
  '其他'
];

const DEFAULT_CATEGORY = '其他';

/**
 * 有序规则表：先匹配先生效。
 * key 为分类枚举，value 为命中即归类的关键词/正则。
 *
 * 边界纪律：英文短词一律加 `\b` 词边界（避免 `invoices` 命中 `voice`、`provide`/`video` 命中 `ide`、
 * `article`/`start` 命中 `art`、`build`/`suite` 命中 `ui`、`no-code` 命中 `code`）。
 */
const RULES = [
  ['API服务', /\b(?:api|sdk|endpoint|inference)\b|\bplatform\b.*\bmodel\b|api服务|接口|算力|推理/i],
  ['对话模型', /\b(?:chat|chatbot|chat bot|conversation|llm|language model|gpt|claude|gemini|grok)\b|对话|大模型|语言模型|通用模型|多模态模型/i],
  ['图像绘画', /\b(?:image|photo|avatar|portrait|illustration|drawing|midjourney|stable diffusion)\b|\bgenerat\w*\s+art\b|\bai\s+art\b|绘画|图像|图片|头像|写真|文生图|图生图/i],
  ['视频', /\b(?:video|animation|motion|clip|reel|film|movie|lip.?sync)\b|视频|动画|剪辑/i],
  ['音频语音', /\b(?:audio|voice|speech|tts|text.?to.?speech|speech.?to.?text|transcrib\w*|transcription|podcast|music)\b|音频|语音|配音|转录|音乐/i],
  ['编程开发', /(?<!no[- ]|low[- ])\b(?:code|coding)\b|\b(?:developer|programming|ide|debug|devops|sql|graphql|test automation|api.?dev)\b|编程|代码|开发|调试/i],
  ['办公效率', /\b(?:productivity|office|note|meeting|calendar|email|document|spreadsheet|slide|presentation|workflow|automation|project management|task|crm|invoice|invoicing|proposal|contract|no-code|low-code)\b|办公|效率|笔记|会议|文档|表格|演示|自动化|项目管理/i],
  ['智能体', /\b(?:agent|agentic|autonomous|assistant|copilot)\b|智能体|代理|助手/i],
  ['搜索研究', /\b(?:search|research|academic|paper|knowledge|benchmark|data analysis|citation)\b|搜索|研究|学术|论文|知识库|文献|基准/i],
  ['设计创意', /\b(?:design|ui|ux|graphic|brand|logo|typography|creative)\b|设计|创意|品牌|排版/i],
  ['教育学习', /\b(?:education|student|school|teacher|course|learn|tutor|homework|study)\b|教育|学生|学校|教师|课程|学习|作业/i]
];

/**
 * 把任意来源的自由文本分类 / 标题 / 描述 映射到固定枚举。
 * @param {object} input { category, title, description }
 * @returns {string} CATEGORIES 中的一项
 */
function mapCategory(input = {}) {
  const rawCategory = String(input.category || '').trim();
  const title = String(input.title || '');
  const description = String(input.description || '');

  // 已经是枚举值直接返回
  if (CATEGORIES.includes(rawCategory)) return rawCategory;

  // 1) 分类字段优先
  if (rawCategory) {
    for (const [name, re] of RULES) {
      if (re.test(rawCategory)) return name;
    }
  }

  // 2) 标题次之
  if (title) {
    for (const [name, re] of RULES) {
      if (re.test(title)) return name;
    }
  }

  // 3) 描述兜底
  if (description) {
    for (const [name, re] of RULES) {
      if (re.test(description)) return name;
    }
  }

  return DEFAULT_CATEGORY;
}

module.exports = { CATEGORIES, DEFAULT_CATEGORY, mapCategory };
