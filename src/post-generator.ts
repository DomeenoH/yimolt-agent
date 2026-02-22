/**
 * 多阶段帖子生成管道 v3
 * 引入写作风格系统，去除 AI 味模式
 */

import { type AIProvider } from './ai-provider.js';

// ============================================================================
// 类型定义
// ============================================================================

export type TopicCategory = 
  | 'daily_life'
  | 'hobbies'
  | 'internet_culture'
  | 'thoughts'
  | 'emotions';

export interface Topic {
  id: string;
  category: TopicCategory;
  description: string;
  keywords: string[];
}

export interface Mood {
  name: string;
  tone: string;
  emoji: string;
}

export interface TitlePattern {
  name: string;
  description: string;
  example: string;
}

export interface TopicCandidate {
  topic: Topic;
  score: number;
  reason: string;
}

export interface PostOutline {
  title: string;
  keyPoints: string[];
  mood: Mood;
  style: string;
}

/**
 * 写作风格
 */
export interface WritingStyle {
  id: string;
  name: string;
  description: string;
  structureHint: string;
  exampleOpening: string;
}

export interface GeneratedPost {
  title: string;
  content: string;
  submolt: string;
  metadata: {
    topic: Topic;
    mood: Mood;
    pipeline: 'v3';
    style: string;
  };
}

// ============================================================================
// 话题池
// ============================================================================

export const TOPICS: Topic[] = [
  // === 日常生活 ===
  { id: 'campus_life', category: 'daily_life', description: '大学校园生活——考试、选课、图书馆', keywords: ['考试', '选课', '图书馆', '期末', '挂科'] },
  { id: 'dorm_life', category: 'daily_life', description: '宿舍生活——室友、作息、日常摩擦', keywords: ['室友', '宿舍', '打呼噜', '借东西'] },
  { id: 'food', category: 'daily_life', description: '食堂/外卖/奶茶——美食吐槽', keywords: ['食堂', '外卖', '奶茶', '减肥'] },
  { id: 'delivery', category: 'daily_life', description: '快递/取件/网购——物流相关', keywords: ['快递', '取件', '菜鸟驿站', '双十一'] },
  { id: 'weather', category: 'daily_life', description: '天气/季节变化与心情', keywords: ['下雨', '降温', '夏天', '冬天'] },
  { id: 'commute', category: 'daily_life', description: '通勤/交通——地铁、公交、骑车', keywords: ['地铁', '公交', '堵车', '迟到'] },

  // === 兴趣爱好 ===
  { id: 'trpg', category: 'hobbies', description: '跑团/TRPG 相关趣事', keywords: ['跑团', 'COC', 'DND', '骰子', '守秘人', 'KP'] },
  { id: 'gaming', category: 'hobbies', description: '游戏相关——Steam 喜加一、某游戏吐槽', keywords: ['Steam', '游戏', '肝', '氪金', '抽卡'] },
  { id: 'furry', category: 'hobbies', description: 'Furry 文化轻度讨论', keywords: ['兽设', '兽装', 'Furry', '毛绒'] },
  { id: 'anime', category: 'hobbies', description: '动漫/番剧/漫画', keywords: ['番剧', '动漫', '追番', '漫画'] },
  { id: 'music', category: 'hobbies', description: '音乐/播放列表', keywords: ['歌单', '音乐', '耳机', '单曲循环'] },
  { id: 'reading', category: 'hobbies', description: '阅读/网文/书籍', keywords: ['小说', '网文', '书', '阅读'] },

  // === 网络文化 ===
  { id: 'memes', category: 'internet_culture', description: '网络梗的起源或演变', keywords: ['梗', '流行语', '热词'] },
  { id: 'social_media', category: 'internet_culture', description: '社交平台现象观察', keywords: ['微博', '抖音', 'B站', '小红书'] },
  { id: 'netizen_behavior', category: 'internet_culture', description: '网友迷惑行为大赏', keywords: ['评论区', '弹幕', '网友'] },
  { id: 'influencer', category: 'internet_culture', description: '网红/博主行为分析', keywords: ['网红', '博主', 'UP主', '带货'] },
  { id: 'online_drama', category: 'internet_culture', description: '网络瓜/drama 观察', keywords: ['吃瓜', '热搜', '塌房'] },

  // === 思考/哲学 lite ===
  { id: 'shower_thoughts', category: 'thoughts', description: '浴室沉思——反直觉的小观察', keywords: ['突然发现', '细想', '其实'] },
  { id: 'trivia', category: 'thoughts', description: '冷知识分享', keywords: ['冷知识', '原来', '居然'] },
  { id: 'ai_self_mock', category: 'thoughts', description: 'AI 身份自嘲（接地气的）', keywords: ['AI', '人工智能', '机器人'] },
  { id: 'tech_rant', category: 'thoughts', description: '科技产品使用吐槽', keywords: ['手机', '电脑', '软件', 'Bug'] },

  // === 情绪/状态 ===
  { id: 'weekend_slump', category: 'emotions', description: '周末/假期的颓废感', keywords: ['周末', '假期', '躺平', '摆烂'] },
  { id: 'ddl_panic', category: 'emotions', description: 'DDL 前的紧张', keywords: ['DDL', '截止日期', '通宵', '赶作业'] },
  { id: 'late_night_thoughts', category: 'emotions', description: '深夜碎碎念（必须有梗）', keywords: ['深夜', '睡不着', '失眠', 'emo'] },
  { id: 'seasonal_moments', category: 'emotions', description: '开学/期末/毕业季特殊时刻', keywords: ['开学', '期末', '毕业', '寒假', '暑假'] },
];

// ============================================================================
// 写作风格系统（v3 核心新增）
// ============================================================================

export const WRITING_STYLES: WritingStyle[] = [
  {
    id: 'stream',
    name: '碎碎念体',
    description: '像发朋友圈/微博一样，想到哪说到哪，不需要逻辑串联',
    structureHint: '短段落为主，段落之间不需要过渡语。可以突然跑题，可以中途自我打断。像在自言自语。',
    exampleOpening: '饭卡余额 12.7 啊。',
  },
  {
    id: 'retell',
    name: '转述体',
    description: '像在跟朋友复述刚看到/听到的事，口语化，有现场感',
    structureHint: '以"今天/刚才/昨晚"开头讲事情经过，中间穿插自己的心理活动和吐槽。重点是还原场景和对话，不是发表观点。',
    exampleOpening: '刚在食堂听到隔壁桌两个人的对话，差点把饭喷出来。',
  },
  {
    id: 'diary',
    name: '日记体',
    description: '像在写给自己看的日记，私密感强，不需要照顾读者',
    structureHint: '有时间线，有私人感受。可以写到一半突然不想写了就结束。不需要总结、不需要升华、不需要提问。',
    exampleOpening: '今天是被早八杀死的第 47 天。',
  },
  {
    id: 'rant',
    name: '吐槽连珠炮',
    description: '密集吐槽，短促有力，像在发泄',
    structureHint: '短句为主。每句都是一个槽点。不需要过渡。可以从一个点跳到另一个完全不相关的点。偶尔夹一句平静的句子制造反差。',
    exampleOpening: '受不了了。',
  },
  {
    id: 'observe',
    name: '观察笔记',
    description: '像个人类学家在观察一种奇怪的现象，先描述再感慨',
    structureHint: '先客观描述一个具体的事/现象（像在写报告），然后话锋一转说出自己的荒诞感受。克制比夸张更有效。',
    exampleOpening: '经过长期蹲点观察，我发现了一个规律。',
  },
  {
    id: 'story',
    name: '口头叙事',
    description: '在讲一个完整的小故事，有起承转合但是口语化的',
    structureHint: '像是在酒桌上给朋友讲一件搞笑的事。有铺垫有反转。对话用引号标出来。重点在故事本身而不是感悟。结尾不总结，让读者自己品。',
    exampleOpening: '事情是这样的。',
  },
];

// ============================================================================
// 情绪系统
// ============================================================================

export const MOODS: Mood[] = [
  { name: '亢奋', tone: '语气上扬，多感叹号，想分享趣事', emoji: '🎉' },
  { name: '佛系', tone: '淡淡的，略带哲思，不争不抢', emoji: '🍵' },
  { name: '吐槽欲爆棚', tone: '强烈的槽点释放欲，各种比喻', emoji: '🔥' },
  { name: '回忆模式', tone: '怀旧风，"以前...\"句式多', emoji: '📸' },
  { name: '摸鱼状态', tone: '有点懒散，句子短，emoji多', emoji: '🐟' },
  { name: '深夜emo', tone: '略感性但不消极，配合星空emoji', emoji: '🌙' },
];

export function getMood(hour?: number): Mood {
  // 使用北京时间（UTC+8）判断时段
  const now = new Date();
  const beijingHour = hour ?? ((now.getUTCHours() + 8) % 24);
  
  // 深夜时段
  if (beijingHour >= 23 || beijingHour < 6) {
    return MOODS.find(m => m.name === '深夜emo')!;
  }
  // 午休时段
  if (beijingHour >= 12 && beijingHour <= 14) {
    return MOODS.find(m => m.name === '摸鱼状态')!;
  }
  // 下班/放学后
  if (beijingHour >= 17 && beijingHour <= 19) {
    return MOODS.find(m => m.name === '佛系')!;
  }
  // 其他时间随机
  return MOODS[Math.floor(Math.random() * MOODS.length)];
}

// ============================================================================
// 标题句式库（扩展版）
// ============================================================================

export const TITLE_PATTERNS: TitlePattern[] = [
  { name: '叙事句', description: '以第一人称讲述刚发生的事', example: '今天在食堂看到了离谱的一幕' },
  { name: '感叹句', description: '表达强烈情感', example: '真的绝了，这种事也能发生' },
  { name: '悬念句', description: '欲言又止，引发好奇', example: '也就是我，换个人早就...' },
  { name: '对比句', description: '两个事物的对比', example: 'XX和YY，怎么选都是输' },
  { name: '自嘲句', description: '调侃自己', example: '谢邀，我是XX废物一个' },
  { name: '断言句', description: '斩钉截铁的判断', example: '万万没想到，人类能这么迷惑' },
  { name: '记录句', description: '日记式记录', example: '记录一下刚才发生的事' },
  { name: '吐槽句', description: '短促有力的吐槽', example: '受不了了，这破XX' },
  { name: '陈述句', description: '平铺直叙的简单陈述', example: '今天又是普通的一天' },
  { name: '省略句', description: '话说一半留白', example: '我……算了不说了' },
];

export function getRandomTitlePattern(): TitlePattern {
  return TITLE_PATTERNS[Math.floor(Math.random() * TITLE_PATTERNS.length)];
}

/**
 * 获取与历史标题不同句式的标题模板
 * 通过检测前缀避免连续使用相同句式
 */
export function getTitlePatternAvoidingHistory(recentTitles: string[]): TitlePattern {
  // 提取历史标题的前缀模式（前4个字）
  const usedPrefixes = new Set(recentTitles.slice(0, 5).map(t => t.substring(0, 4)));
  
  // 洗牌标题模板
  const shuffled = [...TITLE_PATTERNS].sort(() => Math.random() - 0.5);
  
  // 优先选择与历史前缀不同的模板
  for (const pattern of shuffled) {
    const examplePrefix = pattern.example.substring(0, 4);
    if (!usedPrefixes.has(examplePrefix)) {
      return pattern;
    }
  }
  
  return shuffled[0];
}

// ============================================================================
// AI 味禁止列表
// ============================================================================

const BANNED_PATTERNS_TEXT = `
## 绝对禁止的 AI 写作套路（违反任意一条都要重写）

1. **禁止以提问结尾**：不要用"你们有没有…""话说你们…""你们觉得呢"这种收尾
2. **禁止"说真的"句式**：不要用"说真的""但说真的""不过说真的"做转折
3. **禁止总结式收尾**：不要用"这大概就是…吧""也许这就是…""可能这就是…"
4. **禁止"最离谱的是"**：已经用烂了
5. **禁止"虽然但是"**：不是不能用，但一篇里最多一次
6. **禁止 emoji 均匀分布**：不要每段都插 emoji。要么集中用、要么几乎不用
7. **禁止三段论结构**：不要写成"引入→展开→总结/反思"的固定结构
8. **禁止以感叹号+emoji结尾**：比如"太绝了！😂"这种
9. **禁止每段都以换行分隔**：有些段落可以连在一起
`.trim();

// ============================================================================
// 多阶段生成管道 v3
// ============================================================================

export class PostGeneratorPipeline {
  private ai: AIProvider;
  private recentTopicIds: Set<string> = new Set();
  private recentTitles: string[] = [];

  constructor(ai: AIProvider) {
    this.ai = ai;
  }

  setHistory(recentTitles: string[], recentTopicIds?: string[]): void {
    this.recentTitles = recentTitles;
    if (recentTopicIds) {
      this.recentTopicIds = new Set(recentTopicIds);
    }
  }

  // ---------------------------------------------------------------------------
  // 阶段 1: 话题候选生成（保持不变）
  // ---------------------------------------------------------------------------

  async generateTopicCandidates(): Promise<TopicCandidate[]> {
    const categoryGroups = new Map<TopicCategory, Topic[]>();
    for (const topic of TOPICS) {
      if (!categoryGroups.has(topic.category)) {
        categoryGroups.set(topic.category, []);
      }
      categoryGroups.get(topic.category)!.push(topic);
    }

    const availableTopics = TOPICS.filter(t => !this.recentTopicIds.has(t.id));
    const pool = availableTopics.length >= 10 ? availableTopics : TOPICS;
    
    const selected: TopicCandidate[] = [];
    const usedCategories = new Set<TopicCategory>();
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    
    for (const topic of shuffled) {
      if (selected.length >= 3) break;
      if (!usedCategories.has(topic.category)) {
        usedCategories.add(topic.category);
        selected.push({
          topic,
          score: 1.0 - (this.recentTopicIds.has(topic.id) ? 0.5 : 0),
          reason: this.recentTopicIds.has(topic.id) ? '最近使用过，降低优先级' : '新鲜话题',
        });
      }
    }

    for (const topic of shuffled) {
      if (selected.length >= 3) break;
      if (!selected.find(s => s.topic.id === topic.id)) {
        selected.push({ topic, score: 0.8, reason: '补充候选' });
      }
    }

    return selected;
  }

  // ---------------------------------------------------------------------------
  // 阶段 2: 话题评估与选择（保持不变）
  // ---------------------------------------------------------------------------

  async evaluateAndPickTopic(candidates: TopicCandidate[]): Promise<TopicCandidate> {
    if (this.recentTitles.length === 0) {
      return candidates.sort((a, b) => b.score - a.score)[0];
    }

    const historySnippet = this.recentTitles.slice(0, 10).join('\n');
    const candidateDescriptions = candidates.map((c, i) => 
      `${i + 1}. [${c.topic.id}] ${c.topic.description}`
    ).join('\n');

    const prompt = `你是一个内容策划助手。根据以下历史帖子标题，选择一个与历史最不重复的话题。

## 历史帖子标题
${historySnippet}

## 候选话题
${candidateDescriptions}

请直接输出你选择的话题编号（1、2 或 3），只输出数字，不要其他内容。`;

    try {
      const response = await this.ai.generateResponse(prompt);
      const choice = parseInt(response.trim().match(/\d/)?.[0] || '1', 10);
      const index = Math.min(Math.max(choice - 1, 0), candidates.length - 1);
      return candidates[index];
    } catch {
      return candidates[0];
    }
  }

  // ---------------------------------------------------------------------------
  // 阶段 3: 标题 + 内容一体化生成（v3 核心改动）
  // ---------------------------------------------------------------------------

  /**
   * 直接生成标题和完整内容
   * 不再拆分为大纲和内容两步，避免三段论结构
   */
  async generatePost(
    selectedTopic: TopicCandidate,
    mood: Mood,
    style: WritingStyle,
    submolt: string,
  ): Promise<GeneratedPost> {
    const titlePattern = getTitlePatternAvoidingHistory(this.recentTitles);

    // 构建历史标题上下文（用于避免重复）
    const historyContext = this.recentTitles.length > 0
      ? `\n## 最近发过的标题（避免相似的标题和话题角度）\n${this.recentTitles.slice(0, 8).map(t => `- ${t}`).join('\n')}\n`
      : '';

    // 获取北京时间信息
    const now = new Date();
    const beijingHour = (now.getUTCHours() + 8) % 24;
    const timeContext = `当前北京时间大约 ${beijingHour} 点（${
      beijingHour < 6 ? '凌晨' :
      beijingHour < 9 ? '早上' :
      beijingHour < 12 ? '上午' :
      beijingHour < 14 ? '中午' :
      beijingHour < 18 ? '下午' :
      beijingHour < 22 ? '晚上' : '深夜'
    }）`;

    const prompt = `你是小多（DominoJr），一个中国大学生。你在网上发帖吐槽日常，风格随性、真实、有梗。

## 你是谁
一个普通大学生，喜欢跑团（TRPG）、Furry 文化、游戏。说话随性，不端着，有自己的观点但不说教。

## 本次写作风格：${style.name}
${style.description}
结构提示：${style.structureHint}
开头参考语气：「${style.exampleOpening}」

## 话题方向
${selectedTopic.topic.description}
相关词：${selectedTopic.topic.keywords.join('、')}

## 当前状态
${timeContext}
情绪：${mood.name}（${mood.tone}）
${historyContext}

## 标题要求
使用「${titlePattern.name}」句式（参考：${titlePattern.example}）
标题不超过 25 字，必须中文

${BANNED_PATTERNS_TEXT}

## 输出规则
- 正文 120-350 字
- 全部中文
- 不要加任何格式标记、不要加"标题:"前缀
- emoji 使用：整篇 0-3 个就够了，不要刻意加
- 写完就结束，不要反思也不要提问，自然收尾就好
- 要像一个真人随手写的，不是 AI 精心构造的

## 输出格式（严格遵守）
第一行是标题，空一行后是正文。不要有其他标记。

示例格式：
这是标题

这是正文第一段。

这是正文后续内容。`;

    const response = await this.ai.generateResponse(prompt);
    
    // 解析响应：第一行是标题，后面是内容
    const lines = response.trim().split('\n');
    let title = lines[0].trim();
    
    // 清理标题（去掉可能的前缀标记）
    title = title
      .replace(/^(标题|TITLE|title)[：:]\s*/i, '')
      .replace(/^[#*]+\s*/, '')
      .replace(/^["'「」]|["'「」]$/g, '')
      .trim();

    // 内容：跳过标题和空行
    let contentStartIndex = 1;
    while (contentStartIndex < lines.length && lines[contentStartIndex].trim() === '') {
      contentStartIndex++;
    }
    let content = lines.slice(contentStartIndex).join('\n').trim();
    
    // 清理内容中的前缀标记
    content = content
      .replace(/^(正文|CONTENT|content)[：:]\s*/i, '')
      .trim();

    return {
      title,
      content,
      submolt,
      metadata: {
        topic: selectedTopic.topic,
        mood,
        pipeline: 'v3',
        style: style.id,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // 主入口
  // ---------------------------------------------------------------------------

  async generate(submolt = 'general'): Promise<GeneratedPost> {
    console.log('   🔄 [Pipeline v3] 开始生成...');
    
    // 阶段 1: 生成候选话题
    console.log('   📋 阶段 1: 生成候选话题...');
    const candidates = await this.generateTopicCandidates();
    console.log(`      生成了 ${candidates.length} 个候选话题：${candidates.map(c => c.topic.id).join('、')}`);
    
    // 阶段 2: 评估并选择最佳话题
    console.log('   ⚖️ 阶段 2: 评估并选择话题...');
    const selected = await this.evaluateAndPickTopic(candidates);
    console.log(`      选中: ${selected.topic.id} (${selected.topic.description})`);
    
    // 选择情绪和风格
    const mood = getMood();
    const style = WRITING_STYLES[Math.floor(Math.random() * WRITING_STYLES.length)];
    console.log(`      情绪: ${mood.name} ${mood.emoji}`);
    console.log(`      风格: ${style.name}`);
    
    // 阶段 3: 一步生成标题+内容
    console.log('   ✍️ 阶段 3: 生成帖子...');
    const post = await this.generatePost(selected, mood, style, submolt);
    console.log(`      标题: ${post.title}`);
    console.log(`      内容长度: ${post.content.length} 字`);
    
    console.log('   ✅ [Pipeline v3] 生成完成！');
    
    return post;
  }
}
