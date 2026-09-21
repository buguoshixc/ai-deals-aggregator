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
 */
const RULES = [
  ['对话模型', /chat|chatbot|chat bot|conversation|llm|language model|gpt|claude|gemini|grok|对话|大模型|语言模型|通用模型|多模态模型/i],
  ['图像绘画', /image|photo|art|avatar|portrait|illustration|drawing|generat.*art|midjourney|stable diffusion|绘画|图像|图片|头像|写真|文生图|图生图/i],
  ['视频', /video|animation|motion|clip|reel|film|movie|lip.?sync|视频|动画|剪辑|配音/i],
  ['音频语音', /audio|voice|speech|tts|text.?to.?speech|speech.?to.?text|transcri|podcast|music|音频|语音|配音|转录|音乐/i],
  ['编程开发', /code|coding|developer|programming|ide|debug|devops|ql|test automation|api.?dev|编程|代码|开发|调试/i],
  ['办公效率', /productivity|office|note|meeting|calendar|email|document|spreadsheet|slide|presentation|workflow|automation|project management|task|办公|效率|笔记|会议|文档|表格|演示|自动化|项目管理/i],
  ['API服务', /api|sdk|endpoint|platform.*model|cloud|inference|hosting|api服务|接口|算力|推理/i],
  ['智能体', /agent|agentic|autonomous|assistant|copilot|智能体|代理|助手/i],
  ['搜索研究', /search|research|academic|paper|knowledge|benchmark|data analysis|citation|搜索|研究|学术|论文|知识库|文献|基准/i],
  ['设计创意', /design|ui|ux|graphic|brand|logo|typography|creative|设计|创意|品牌|logo|排版/i],
  ['教育学习', /education|student|school|teacher|course|learn|tutor|homework|study|教育|学生|学校|教师|课程|学习|作业/i]
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
