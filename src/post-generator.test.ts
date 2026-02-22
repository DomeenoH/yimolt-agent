/**
 * PostGeneratorPipeline 单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PostGeneratorPipeline,
  TOPICS,
  MOODS,
  TITLE_PATTERNS,
  getMood,
  getRandomTitlePattern,
  type TopicCandidate,
} from './post-generator.js';

// Mock AI Provider
const createMockAI = () => ({
  generateResponse: vi.fn(),
});

describe('PostGeneratorPipeline', () => {
  describe('话题池（TOPICS）', () => {
    it('话题数量应大于 20', () => {
      expect(TOPICS.length).toBeGreaterThan(20);
    });

    it('每个话题应有完整的字段', () => {
      for (const topic of TOPICS) {
        expect(topic.id).toBeDefined();
        expect(topic.category).toBeDefined();
        expect(topic.description).toBeDefined();
        expect(topic.keywords).toBeDefined();
        expect(topic.keywords.length).toBeGreaterThan(0);
      }
    });

    it('话题 ID 应唯一', () => {
      const ids = TOPICS.map(t => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('应包含所有 5 个类别', () => {
      const categories = new Set(TOPICS.map(t => t.category));
      expect(categories).toContain('daily_life');
      expect(categories).toContain('hobbies');
      expect(categories).toContain('internet_culture');
      expect(categories).toContain('thoughts');
      expect(categories).toContain('emotions');
    });
  });

  describe('情绪系统（MOODS）', () => {
    it('情绪数量应为 6', () => {
      expect(MOODS.length).toBe(6);
    });

    it('每个情绪应有完整的字段', () => {
      for (const mood of MOODS) {
        expect(mood.name).toBeDefined();
        expect(mood.tone).toBeDefined();
        expect(mood.emoji).toBeDefined();
      }
    });
  });

  describe('getMood()', () => {
    it('深夜时段(23:00-06:00)应返回深夜emo', () => {
      expect(getMood(23).name).toBe('深夜emo');
      expect(getMood(0).name).toBe('深夜emo');
      expect(getMood(3).name).toBe('深夜emo');
      expect(getMood(5).name).toBe('深夜emo');
    });

    it('午休时段(12:00-14:00)应返回摸鱼状态', () => {
      expect(getMood(12).name).toBe('摸鱼状态');
      expect(getMood(13).name).toBe('摸鱼状态');
      expect(getMood(14).name).toBe('摸鱼状态');
    });

    it('下班时段(17:00-19:00)应返回佛系', () => {
      expect(getMood(17).name).toBe('佛系');
      expect(getMood(18).name).toBe('佛系');
      expect(getMood(19).name).toBe('佛系');
    });

    it('其他时段应返回有效的情绪', () => {
      const mood = getMood(10);
      expect(MOODS.find(m => m.name === mood.name)).toBeDefined();
    });
  });

  describe('标题句式（TITLE_PATTERNS）', () => {
    it('标题句式数量应大于 5', () => {
      expect(TITLE_PATTERNS.length).toBeGreaterThan(5);
    });

    it('每个句式应有完整的字段', () => {
      for (const pattern of TITLE_PATTERNS) {
        expect(pattern.name).toBeDefined();
        expect(pattern.description).toBeDefined();
        expect(pattern.example).toBeDefined();
      }
    });
  });

  describe('getRandomTitlePattern()', () => {
    it('应返回有效的标题句式', () => {
      const pattern = getRandomTitlePattern();
      expect(TITLE_PATTERNS.find(p => p.name === pattern.name)).toBeDefined();
    });
  });

  describe('PostGeneratorPipeline', () => {
    let mockAI: ReturnType<typeof createMockAI>;
    let pipeline: PostGeneratorPipeline;

    beforeEach(() => {
      mockAI = createMockAI();
      pipeline = new PostGeneratorPipeline(mockAI as any);
    });

    describe('generateTopicCandidates()', () => {
      it('应返回 3 个候选话题', async () => {
        const candidates = await pipeline.generateTopicCandidates();
        expect(candidates.length).toBe(3);
      });

      it('候选话题应有完整的字段', async () => {
        const candidates = await pipeline.generateTopicCandidates();
        for (const candidate of candidates) {
          expect(candidate.topic).toBeDefined();
          expect(candidate.score).toBeDefined();
          expect(candidate.reason).toBeDefined();
        }
      });

      it('设置历史后应降低已使用话题的优先级', async () => {
        pipeline.setHistory([], ['campus_life', 'dorm_life', 'food']);
        const candidates = await pipeline.generateTopicCandidates();
        
        // 至少有一个候选不在历史中
        const newTopics = candidates.filter(
          c => !['campus_life', 'dorm_life', 'food'].includes(c.topic.id)
        );
        expect(newTopics.length).toBeGreaterThan(0);
      });
    });

    describe('evaluateAndPickTopic()', () => {
      it('历史为空时应直接返回得分最高的', async () => {
        const candidates: TopicCandidate[] = [
          { topic: TOPICS[0], score: 0.5, reason: 'test' },
          { topic: TOPICS[1], score: 1.0, reason: 'test' },
          { topic: TOPICS[2], score: 0.8, reason: 'test' },
        ];
        
        const result = await pipeline.evaluateAndPickTopic(candidates);
        expect(result.topic.id).toBe(TOPICS[1].id);
      });

      it('有历史时应调用 AI', async () => {
        pipeline.setHistory(['帖子1', '帖子2', '帖子3']);
        mockAI.generateResponse.mockResolvedValue('2');
        
        const candidates: TopicCandidate[] = [
          { topic: TOPICS[0], score: 1.0, reason: 'test' },
          { topic: TOPICS[1], score: 1.0, reason: 'test' },
          { topic: TOPICS[2], score: 1.0, reason: 'test' },
        ];
        
        const result = await pipeline.evaluateAndPickTopic(candidates);
        expect(mockAI.generateResponse).toHaveBeenCalled();
        expect(result.topic.id).toBe(TOPICS[1].id);
      });
    });

    describe('generatePost()', () => {
      it('应返回完整的帖子', async () => {
        mockAI.generateResponse.mockResolvedValue(`测试标题

这是一段测试内容，大概 150-400 字左右...`);
        
        const candidate: TopicCandidate = {
          topic: TOPICS[0],
          score: 1.0,
          reason: 'test',
        };

        // 导入 WritingStyle
        const { WRITING_STYLES } = await import('./post-generator.js');
        
        const post = await pipeline.generatePost(candidate, MOODS[0], WRITING_STYLES[0], 'general');
        
        expect(post.title).toBe('测试标题');
        expect(post.content).toBeDefined();
        expect(post.submolt).toBe('general');
        expect(post.metadata.pipeline).toBe('v3');
        expect(post.metadata.style).toBe(WRITING_STYLES[0].id);
      });

      it('应正确解析标题和内容', async () => {
        mockAI.generateResponse.mockResolvedValue(`今天食堂又出新菜了

说是新菜其实就是换了个摆盘。`);
        
        const candidate: TopicCandidate = {
          topic: TOPICS[0],
          score: 1.0,
          reason: 'test',
        };

        const { WRITING_STYLES } = await import('./post-generator.js');
        const post = await pipeline.generatePost(candidate, MOODS[0], WRITING_STYLES[0], 'general');
        
        expect(post.title).toBe('今天食堂又出新菜了');
        expect(post.content).toBe('说是新菜其实就是换了个摆盘。');
      });
    });

    describe('generate() 完整流程', () => {
      it('应执行完整的 3 阶段流程', async () => {
        // v3: 只需要 mock 一次 AI 调用（阶段3: generatePost）
        // 阶段2 在无历史时不调用 AI
        mockAI.generateResponse
          .mockResolvedValueOnce(`测试标题

这是最终生成的内容`);
        
        const post = await pipeline.generate('general');
        
        expect(post.title).toBe('测试标题');
        expect(post.content).toBe('这是最终生成的内容');
        expect(post.submolt).toBe('general');
        expect(post.metadata.pipeline).toBe('v3');
        expect(post.metadata.topic).toBeDefined();
        expect(post.metadata.mood).toBeDefined();
        expect(post.metadata.style).toBeDefined();
        
        // v3: 阶段3 只调用一次 AI（阶段2无历史时不调用）
        expect(mockAI.generateResponse).toHaveBeenCalledTimes(1);
      });
    });
  });
});
