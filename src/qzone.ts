/**
 * Qzone 客户端
 * 用于与 QQ 空间进行交互，主要是发送说说
 */
export class QzoneClient {
	private napcatApiUrl: string;
	private napcatToken: string | undefined;

	constructor() {
		this.napcatApiUrl = process.env.NAPCAT_API_URL || 'http://localhost:3000';
		this.napcatToken = process.env.NAPCAT_TOKEN;
	}

	/**
	 * 计算 g_tk (bkn)
	 * @param skey p_skey 或 skey
	 */
	private generateGtk(skey: string): string {
		let hash = 5381;
		for (let i = 0; i < skey.length; i++) {
			hash += (hash << 5) + skey.charCodeAt(i);
		}
		return (hash & 2147483647).toString();
	}

	/**
	 * 从 NapCat 获取 Cookies
	 */
	private async getCookiesFromNapcat(): Promise<{ cookies: string; bkn: string; uin: string } | null> {
		try {
			const url = `${this.napcatApiUrl.replace(/\/$/, '')}/get_cookies`;
			const headers: Record<string, string> = {
				'Content-Type': 'application/json',
			};
			
			// Build URL with access_token query param if token exists
			let requestUrl = url;
			if (this.napcatToken) {
				headers['Authorization'] = `Bearer ${this.napcatToken}`;
				const separator = url.includes('?') ? '&' : '?';
				requestUrl = `${url}${separator}access_token=${this.napcatToken}`;
			}

			// 请求 qzone.qq.com 的 cookie
			const response = await fetch(requestUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify({ domain: 'qzone.qq.com' }),
			});

			if (!response.ok) {
				console.error(`❌ 获取 Cookies 请求失败: ${response.status} ${response.statusText}`);
				return null;
			}

			const data = await response.json() as any;
			if (data.status === 'ok' || data.retcode === 0) {
				const cookies = data.data.cookies;
				let bkn = data.data.bkn;
				
				// 尝试从 cookies 中解析 uin
				let uin = '';
				const uinMatch = cookies.match(/uin=o(\d+)/i) || cookies.match(/uin=(\d+)/i);
				if (uinMatch) {
					uin = uinMatch[1];
				}

				// 如果没返回 bkn，尝试从 cookies 计算 (需要 p_skey)
				if (!bkn) {
					const pSkeyMatch = cookies.match(/p_skey=([^;]+)/);
					if (pSkeyMatch) {
						bkn = this.generateGtk(pSkeyMatch[1]);
					}
				}

				return { cookies, bkn, uin };
			} else {
				console.error('❌ 获取 Cookies 失败:', data);
				return null;
			}
		} catch (error) {
			console.error('❌ 请求 NapCat 失败:', error);
			return null;
		}
	}

	/**
	 * 发布说说
	 * @param content 说说内容
	 */
	async publishShuoshuo(content: string): Promise<boolean> {
		try {
			// 1. 获取认证信息
			const auth = await this.getCookiesFromNapcat();
			if (!auth || !auth.cookies || !auth.uin) {
				console.error('❌ 无法获取有效的 Qzone 认证信息，取消发送说说');
				return false;
			}

			// 2. 准备请求数据
			// 接口 URL: https://user.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_publish_v6
			const url = 'https://user.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_publish_v6';
			
			const params = new URLSearchParams();
			params.append('g_tk', auth.bkn);
			params.append('uin', auth.uin);

			const postData = new URLSearchParams();
			postData.append('syn_tweet_verson', '1');
			postData.append('paramstr', '1');
			postData.append('who', '1');
			postData.append('con', content);
			postData.append('feedversion', '1');
			postData.append('ver', '1');
			postData.append('ugc_right', '1');
			postData.append('to_sign', '0');
			postData.append('hostuin', auth.uin);
			postData.append('code_version', '1');
			postData.append('format', 'json');
			postData.append('qzreferrer', `https://user.qzone.qq.com/${auth.uin}`);

			// 3. 发送请求
			const response = await fetch(`${url}?${params.toString()}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'Cookie': auth.cookies,
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
					'Referer': `https://user.qzone.qq.com/${auth.uin}`,
					'Origin': 'https://user.qzone.qq.com',
				},
				body: postData.toString(),
			});

			if (!response.ok) {
				console.error(`❌ Qzone 请求失败: ${response.status} ${response.statusText}`);
				return false;
			}

			// 如果是 json 格式通过 fetch 可能会被自动解析，但这里返回通常是 string
			const resultText = await response.text();
			let result: any;
			try {
				result = JSON.parse(resultText);
			} catch {
				console.error('❌ Qzone 响应非 JSON:', resultText);
				return false;
			}
			
			// 检查结果
			// 成功通常是: {"code":0, "subcode":0, "message":"", "default":0, "data":{...}, "tid":"..."}
			if (result.code === 0 || (result.data && result.data.tid)) {
				console.log(`✅ Qzone 说说发送成功! tid: ${result.tid || 'unknown'}`);
				return true;
			} else {
				console.error('❌ Qzone 说说发送失败:', JSON.stringify(result));
				return false;
			}

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error(`❌ Qzone 发送异常: ${errorMessage}`);
			return false;
		}
	}
}
