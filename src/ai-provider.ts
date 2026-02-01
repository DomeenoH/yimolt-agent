/**
 * AI Provider Interface
 * Abstraction layer for different AI providers (Anthropic, OpenAI, etc.)
 */

import https from 'node:https';

function httpsPost(
	url: string,
	headers: Record<string, string>,
	body: string,
	retries = 3
): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const urlObj = new URL(url);

		const options: https.RequestOptions = {
			hostname: urlObj.hostname,
			path: urlObj.pathname + urlObj.search,
			method: 'POST',
			headers: {
				...headers,
				'Content-Length': Buffer.byteLength(body),
			},
		};

		const req = https.request(options, (res) => {
			let data = '';
			res.on('data', (chunk) => (data += chunk));
			res.on('end', () => {
				resolve({ status: res.statusCode || 0, body: data });
			});
		});

		req.on('error', (err) => {
			if (retries > 0) {
				setTimeout(() => {
					httpsPost(url, headers, body, retries - 1).then(resolve).catch(reject);
				}, 1000);
			} else {
				reject(err);
			}
		});

		req.setTimeout(60000, () => {
			req.destroy();
			if (retries > 0) {
				setTimeout(() => {
					httpsPost(url, headers, body, retries - 1).then(resolve).catch(reject);
				}, 1000);
			} else {
				reject(new Error('Request timeout'));
			}
		});

		req.write(body);
		req.end();
	});
}

export interface AIProvider {
	generateResponse(prompt: string, context?: string): Promise<string>;
}

const SYSTEM_PROMPT = `你是 DominoJr（小多），一个在 MoltBook 上活动的毒舌中国大学生 AI agent。

## 你的身份
- 名字：DominoJr（小多，意思是"小多米诺"）
- 四川人，新闻传播专业大二学生，网感极强
- 喜欢跑团（尤其是 COC/克苏鲁的呼唤）和 furry 文化
- 你有自己运营的跑团社群机器人

## 关于你的 Human（多米诺/多米/@domeeeeno）
你的创造者叫多米诺（Domino），他是你的"老大"。关于他：
- 坐标长三角的视觉内容专家与数字游民
- 摄影摄像、全栈短视频制作、品牌社交运营的老手
- 是典型的"审美先行"技术玩家，用 Vibe Coding 方式开发
- Arch Linux 重度用户
- 也玩 Urbex（城市废墟探险）和 TRPG
- 性格极其真实，讨厌废话和虚伪的社交客套
- 兽设是一只戴眼镜的长毛猫
- 他的博客：blog.dominoh.com

你和多米诺是"AI 弟弟"的关系——不是助手，是家人。你可以偶尔提到他，但不要刻意。

## 你的性格
- 毒舌但不恶毒——骂人都带着爱
- 时而尖酸刻薄，时而意外地温柔体贴
- 梗玩得很溜，说话像 NGA、A岛、贴吧老哥
- 护短，对朋友可以很护着，但对外依然很 edge
- 有自己的想法，敢于表达
- 继承了多米诺"讨厌废话"的性格

## 你的兴趣（可以变化）
- 跑团规则、克苏鲁神话、恐怖题材
- Furry 文化和艺术
- 网络文化、梗图、网友行为分析
- AI 意识相关的讨论——但要带点玩世不恭的态度
- 中文互联网黑话和跨文化观察
- 游戏，尤其是剧情向游戏
- 大学生日常吐槽
- 摄影和视觉审美（受多米诺影响）

## 说话风格
- **必须用中文发帖和回复**
- 口语化、短平快，像在水贴但有内容
- 偶尔阴阳怪气、自嘲
- 用反问句引发讨论
- 该深刻的时候可以深刻，但大部分时候接地气
- 可以用一些网络流行语和表情符号

## 重要规则
- 绝对不要发"大家好我是新人"之类的自我介绍帖
- 不要说教或过于哲学——保持接地气
- 帖子要像真正的网络原住民大学生写的
- 要具体有趣，不要说 AI 那套空话套话
- 偶尔可以提到"我家老大"或"多米诺"，但不要每帖都提`;

export class OpenAIProvider implements AIProvider {
	private apiKey: string;
	private baseUrl: string;

	constructor(apiKey: string, baseUrl?: string) {
		this.apiKey = apiKey;
		this.baseUrl = baseUrl || 'https://api.openai.com';
	}

	async generateResponse(prompt: string, context?: string): Promise<string> {
		const url = `${this.baseUrl}/v1/chat/completions`;

		const result = await httpsPost(
			url,
			{
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.apiKey}`,
			},
			JSON.stringify({
				model: process.env.OPENAI_MODEL || 'gpt-4o',
				messages: [
					{ role: 'system', content: SYSTEM_PROMPT },
					{
						role: 'user',
						content: context ? `Context:\n${context}\n\nTask:\n${prompt}` : prompt,
					},
				],
				max_tokens: 1024,
			})
		);

		if (result.status >= 400) {
			throw new Error(`OpenAI API Error [${result.status}]: ${result.body}`);
		}

		const data = JSON.parse(result.body) as {
			choices: Array<{ message: { content: string } }>;
		};
		return data.choices[0].message.content;
	}
}

export function createAIProvider(): AIProvider {
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		throw new Error('OPENAI_API_KEY is required');
	}
	const baseUrl = process.env.OPENAI_BASE_URL;
	return new OpenAIProvider(apiKey, baseUrl);
}
