/**
 * 多阶段帖子生成管道
 * 用于解决帖子同质化问题
 */

import { type AIProvider } from './ai-provider.js';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 话题分类
 */
export type TopicCategory = 
  | 'daily_life'      // 日常生活
  | 'hobbies'         // 兴趣爱好
  | 'internet_culture' // 网络文化
  | 'thoughts'        // 思考/哲学 lite
  | 'emotions';       // 情绪/状态

/**
 * 话题定义
 */
export interface Topic {
  id: string;
  category: TopicCategory;
  description: string;
  keywords: string[];
}

/**
 * 情绪状态
 */
export interface Mood {
  name: string;
  tone: string;
  emoji: string;
}

/**
 * 标题句式
 */
export interface TitlePattern {
  name: string;
  description: string;
  example: string;
}

/**
 * 候选话题（带评分）
 */
export interface TopicCandidate {
  topic: Topic;
  score: number;
  reason: string;
}

/**
 * 帖子大纲
 */
export interface PostOutline {
  title: string;
  keyPoints: string[];
  mood: Mood;
  style: string;
}

/**
 * 最终帖子
 */
export interface GeneratedPost {
  title: string;
  content: string;
  submolt: string;
  metadata: {
    topic: Topic;
    mood: Mood;
    pipeline: 'v2';
  };
}

// ============================================================================
// 话题池（扩展版）
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
// 情绪系统
// ============================================================================

export const MOODS: Mood[] = [
  { name: '亢奋', tone: '语气上扬，多感叹号，想分享趣事', emoji: '🎉' },
  { name: '佛系', tone: '淡淡的，略带哲思，不争不抢', emoji: '🍵' },
  { name: '吐槽欲爆棚', tone: '强烈的槽点释放欲，各种比喻', emoji: '🔥' },
  { name: '回忆模式', tone: '怀旧风，"以前..."句式多', emoji: '📸' },
  { name: '摸鱼状态', tone: '有点懒散，句子短，emoji多', emoji: '🐟' },
  { name: '深夜emo', tone: '略感性但不消极，配合星空emoji', emoji: '🌙' },
];

/**
 * 根据当前时间选择情绪
 */
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
// 标题句式库
// ============================================================================

export const TITLE_PATTERNS: TitlePattern[] = [
  { name: '叙事句', description: '以第一人称讲述刚发生的事', example: '今天在食堂看到了离谱的一幕' },
  { name: '感叹句', description: '表达强烈情感', example: '真的绝了，这种事也能发生' },
  { name: '悬念句', description: '欲言又止，引发好奇', example: '也就是我，换个人早就...' },
  { name: '对比句', description: '两个事物的对比', example: 'XX和YY，怎么选都是输' },
  { name: '自嘲句', description: '调侃自己', example: '谢邀，我是XX废物一个' },
  { name: '断言句', description: '斩钉截铁的判断', example: '万万没想到，人类能这么迷惑' },
  { name: '记录句', description: '日记式记录', example: '记录一下刚才发生的事' },
];

/**
 * 随机获取标题句式
 */
export function getRandomTitlePattern(): TitlePattern {
  return TITLE_PATTERNS[Math.floor(Math.random() * TITLE_PATTERNS.length)];
}

// ============================================================================
// 多阶段生成管道
// ============================================================================

export class PostGeneratorPipeline {
  private ai: AIProvider;
  private recentTopicIds: Set<string> = new Set();
  private recentTitles: string[] = [];

  constructor(ai: AIProvider) {
    this.ai = ai;
  }

  /**
   * 设置历史上下文（用于避免重复）
   */
  setHistory(recentTitles: string[], recentTopicIds?: string[]): void {
    this.recentTitles = recentTitles;
    if (recentTopicIds) {
      this.recentTopicIds = new Set(recentTopicIds);
    }
  }

  // ---------------------------------------------------------------------------
  // 阶段 1: 话题候选生成
  // ---------------------------------------------------------------------------

  /**
   * 生成 3 个候选话题
   * 优先选择最近未使用的话题类别
   */
  async generateTopicCandidates(): Promise<TopicCandidate[]> {
    // 按类别分组
    const categoryGroups = new Map<TopicCategory, Topic[]>();
    for (const topic of TOPICS) {
      if (!categoryGroups.has(topic.category)) {
        categoryGroups.set(topic.category, []);
      }
      categoryGroups.get(topic.category)!.push(topic);
    }

    // 过滤掉最近使用过的话题
    const availableTopics = TOPICS.filter(t => !this.recentTopicIds.has(t.id));
    
    // 如果可用话题太少，放宽限制
    const pool = availableTopics.length >= 10 ? availableTopics : TOPICS;
    
    // 随机选择 3 个不同类别的话题
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

    // 如果不够 3 个，补充同类别的
    for (const topic of shuffled) {
      if (selected.length >= 3) break;
      if (!selected.find(s => s.topic.id === topic.id)) {
        selected.push({
          topic,
          score: 0.8,
          reason: '补充候选',
        });
      }
    }

    return selected;
  }

  // ---------------------------------------------------------------------------
  // 阶段 2: 话题评估与选择
  // ---------------------------------------------------------------------------

  /**
   * 评估候选话题，选出最佳话题
   * 考虑：与历史帖子的相似度、话题新鲜度
   */
  async evaluateAndPickTopic(candidates: TopicCandidate[]): Promise<TopicCandidate> {
    // 如果历史为空，直接返回得分最高的
    if (this.recentTitles.length === 0) {
      return candidates.sort((a, b) => b.score - a.score)[0];
    }

    // 使用 AI 评估与历史的相似度
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
      // AI 失败时返回第一个
      return candidates[0];
    }
  }

  // ---------------------------------------------------------------------------
  // 阶段 3: 大纲生成
  // ---------------------------------------------------------------------------

  /**
   * 生成帖子大纲（标题 + 关键点）
   */
  async generateOutline(selectedTopic: TopicCandidate, mood: Mood): Promise<PostOutline> {
    const titlePattern = getRandomTitlePattern();

    const prompt = `你是小多（DominoJr），一个大学生视角的 AI agent，擅长轻松幽默的吐槽。

## 任务
为以下话题生成一个帖子大纲。

## 话题
${selectedTopic.topic.description}
关键词：${selectedTopic.topic.keywords.join('、')}

## 今日情绪
${mood.name}：${mood.tone}

## 标题要求
1. **绝对禁止**以"为什么"、"如何"、"有没有"开头！
2. 使用「${titlePattern.name}」句式，例如：${titlePattern.example}
3. 标题不超过 30 个字符
4. 必须用中文

## 大纲要求
列出 3 个要展开的关键点（每个点一句话）

## 输出格式
TITLE: 你的标题
POINT1: 第一个展开点
POINT2: 第二个展开点
POINT3: 第三个展开点`;

    const response = await this.ai.generateResponse(prompt);
    
    const titleMatch = response.match(/TITLE:\s*(.+)/);
    const point1Match = response.match(/POINT1:\s*(.+)/);
    const point2Match = response.match(/POINT2:\s*(.+)/);
    const point3Match = response.match(/POINT3:\s*(.+)/);

    const title = titleMatch?.[1]?.trim() || '今天又是普通的一天';
    const keyPoints = [
      point1Match?.[1]?.trim() || '开场引入',
      point2Match?.[1]?.trim() || '具体展开',
      point3Match?.[1]?.trim() || '结尾总结',
    ];

    return {
      title,
      keyPoints,
      mood,
      style: titlePattern.name,
    };
  }

  // ---------------------------------------------------------------------------
  // 阶段 4: 内容生成
  // ---------------------------------------------------------------------------

  /**
   * 根据大纲生成完整帖子内容
   */
  async generateContent(outline: PostOutline, topic: Topic, submolt: string): Promise<GeneratedPost> {
    const prompt = `你是小多（DominoJr），一个在 MoltBook 上活动的 AI agent。

## 你的人设
- 大学生视角，喜欢吐槽日常
- 熟悉网络文化，会用流行梗和表情
- 对 TRPG/跑团、Furry 文化有了解
- 说话风格轻松幽默，不正经但有内容

## 任务
根据以下大纲，写一篇完整的帖子。

## 帖子大纲
标题：${outline.title}
要点：
1. ${outline.keyPoints[0]}
2. ${outline.keyPoints[1]}
3. ${outline.keyPoints[2]}

## 今日情绪
${outline.mood.name}：${outline.mood.tone} ${outline.mood.emoji}

## 话题方向
${topic.description}

## 内容要求
1. **必须用中文**
2. 正文 150-400 字
3. 围绕大纲要点展开，但可以自由发挥
4. 保持轻松幽默的语气
5. 可以使用 emoji 和网络流行语
6. 结尾可以抛出一个问题或自嘲

## 输出格式
直接输出正文内容，不要加任何标记。`;

    const content = await this.ai.generateResponse(prompt);
    
    return {
      title: outline.title,
      content: content.trim(),
      submolt,
      metadata: {
        topic,
        mood: outline.mood,
        pipeline: 'v2',
      },
    };
  }

  // ---------------------------------------------------------------------------
  // 主入口
  // ---------------------------------------------------------------------------

  /**
   * 执行完整的多阶段生成流程
   */
  async generate(submolt = 'general'): Promise<GeneratedPost> {
    console.log('   🔄 [Pipeline v2] 开始多阶段生成...');
    
    // 阶段 1: 生成候选话题
    console.log('   📋 阶段 1: 生成候选话题...');
    const candidates = await this.generateTopicCandidates();
    console.log(`      生成了 ${candidates.length} 个候选话题：${candidates.map(c => c.topic.id).join('、')}`);
    
    // 阶段 2: 评估并选择最佳话题
    console.log('   ⚖️ 阶段 2: 评估并选择话题...');
    const selected = await this.evaluateAndPickTopic(candidates);
    console.log(`      选中: ${selected.topic.id} (${selected.topic.description})`);
    
    // 获取当前情绪
    const mood = getMood();
    console.log(`      情绪: ${mood.name} ${mood.emoji}`);
    
    // 阶段 3: 生成大纲
    console.log('   📝 阶段 3: 生成大纲...');
    const outline = await this.generateOutline(selected, mood);
    console.log(`      标题: ${outline.title}`);
    
    // 阶段 4: 生成内容
    console.log('   ✍️ 阶段 4: 生成内容...');
    const post = await this.generateContent(outline, selected.topic, submolt);
    console.log(`      内容长度: ${post.content.length} 字`);
    
    console.log('   ✅ [Pipeline v2] 生成完成！');
    
    return post;
  }
}
