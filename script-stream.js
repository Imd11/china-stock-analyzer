const API_KEY = 'sk-DqlYesMKwBBmKYcGn0ZSYwGvh2lO7YdYm2lmUpblm8kGjxXp';
const API_URL = 'https://api.tu-zi.com/v1';
const PROXY_URL = 'http://127.0.0.1:3001';

// 搜索股市数据的函数
async function searchStockMarketData(date) {
    console.log('搜索股市数据，日期:', date);
    
    // 使用多个搜索查询来获取全面的股市信息
    const searchQueries = [
        `中国股市 上证指数 深证成指 ${date} 最新数据`,
        `A股上市公司重大事件 ${date}`,
        `中国股市政策 央行 证监会 ${date}`,
        `热门板块 涨停股 ${date} 中国股市`,
        `北向资金 南向资金 ${date}`
    ];
    
    let combinedData = '';
    
    for (let query of searchQueries) {
        try {
            const searchResult = await performWebSearch(query);
            if (searchResult) {
                combinedData += searchResult + '\n\n';
            }
        } catch (error) {
            console.warn('搜索查询失败:', query, error);
        }
    }
    
    return combinedData || '未找到相关实时数据';
}

// 执行网络搜索
async function performWebSearch(query) {
    try {
        // 使用 OpenRouter 的搜索功能
        const response = await fetch(PROXY_URL + '/api/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-5-thinking-all',
                messages: [
                    {
                        role: 'user',
                        content: `请帮我搜索并总结以下查询的最新信息，重点关注数据和事实：${query}`
                    }
                ],
                temperature: 0.3,
                max_tokens: 500,
                stream: false // 搜索不使用流式
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            const message = data.choices[0].message;
            return message.content || message.reasoning || '';
        }
        
    } catch (error) {
        console.error('搜索失败:', error);
    }
    
    return null;
}

// 显示流式结果开始
function showStreamingResult() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('resultSection').style.display = 'block';
    document.getElementById('reportContent').innerHTML = '<div class="streaming-cursor">正在生成报告...</div>';
}

// 更新流式内容
function updateStreamingContent(content) {
    const formattedContent = formatContent(content);
    document.getElementById('reportContent').innerHTML = formattedContent + '<span class="streaming-cursor">▊</span>';
}

// 完成流式显示
function finalizeStreamingContent(content) {
    const formattedContent = formatContent(content);
    document.getElementById('reportContent').innerHTML = formattedContent;
}

document.addEventListener('DOMContentLoaded', function() {
    const dateInput = document.getElementById('date');
    const generateBtn = document.getElementById('generateBtn');
    const loading = document.getElementById('loading');
    const resultSection = document.getElementById('resultSection');
    const reportContent = document.getElementById('reportContent');
    const copyBtn = document.getElementById('copyBtn');
    
    // 设置默认日期为今天
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    
    generateBtn.addEventListener('click', generateReport);
    copyBtn.addEventListener('click', copyReport);
});

async function generateReport() {
    const date = document.getElementById('date').value;
    if (!date) {
        alert('请选择日期');
        return;
    }
    
    showLoading();
    
    try {
        // 直接生成专业分析报告，不搜索实时数据
        const prompt = createSimplePrompt(date);
        const response = await callOpenRouterAPIStream(prompt);
        // 流式响应已经在过程中更新了UI
        finalizeStreamingContent(response);
        
    } catch (error) {
        console.error('Error:', error);
        hideLoading();
        alert('生成报告时出现错误，请稍后重试');
    }
}

// 流式API调用
async function callOpenRouterAPIStream(prompt) {
    console.log('开始调用流式代理API...');
    console.log('代理 URL:', PROXY_URL);
    console.log('Model:', 'gpt-5-thinking-all');
    
    try {
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const apiUrl = isLocal ? (PROXY_URL + '/api/chat/completions') : '/api/chat';
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'
            },
            body: JSON.stringify({
                model: 'gpt-5-thinking-all',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 1500,
                stream: true
            })
        });
        
        console.log('API 响应状态:', response.status);
        console.log('API 响应头:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('API 错误响应:', errorText);
            throw new Error(`API调用失败 (${response.status}): ${errorText}`);
        }
        
        // 处理流式响应
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let content = '';
        let buffer = '';
        
        // 实时更新UI
        showStreamingResult();
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.substring(6);
                    
                    if (data === '[DONE]') {
                        console.log('流式响应完成');
                        break;
                    }
                    
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.choices?.[0]?.delta?.content) {
                            const chunk = parsed.choices[0].delta.content;
                            content += chunk;
                            // 实时更新显示
                            updateStreamingContent(content);
                        }
                    } catch (e) {
                        // 忽略解析错误
                        console.log('跳过非JSON行:', data);
                    }
                }
            }
        }
        
        console.log('最终内容长度:', content.length);
        
        if (!content || content.trim() === '') {
            throw new Error('API返回的内容为空，请重试');
        }
        
        return content;
        
    } catch (error) {
        console.error('API 调用详细错误:', error);
        console.error('错误类型:', error.constructor.name);
        console.error('错误消息:', error.message);
        console.error('错误堆栈:', error.stack);
        
        // 添加更详细的网络错误检测
        if (error instanceof TypeError) {
            if (error.message.includes('fetch')) {
                console.error('网络请求失败 - 可能的原因:');
                console.error('1. CORS策略阻止');
                console.error('2. 网络连接问题');  
                console.error('3. 服务器无响应');
                throw new Error('网络请求失败。如果API有token消耗但浏览器报错，可能是CORS策略问题。请尝试使用代理或服务器端调用。');
            }
        } else if (error.message.includes('401')) {
            throw new Error('API密钥无效或已过期，请检查密钥配置');
        } else if (error.message.includes('403')) {
            throw new Error('API访问被拒绝，请检查权限设置');
        } else if (error.message.includes('429')) {
            throw new Error('API请求频率过高，请稍后重试');
        } else if (error.message.includes('500')) {
            throw new Error('服务器内部错误，请稍后重试');
        } else {
            throw error;
        }
    }
}

// 保留原来的非流式调用函数作为备份
async function callOpenRouterAPI(prompt) {
    return callOpenRouterAPIStream(prompt);
}

// 创建增强版提示词，结合搜索数据和原始提示词
function createEnhancedPrompt(date, searchData) {
    const originalPrompt = createPrompt(date);
    
    return `【实时数据支持】以下是搜索到的${date}相关股市信息：

${searchData}

---

【核心任务】请基于以上实时信息和下面的专业口令，生成高质量的分析报告：

${originalPrompt}`;
}

// 在原始提示词前添加角色设定
function createSimplePrompt(date) {
    return `【角色设定】你是一名专业的金融数据分析师，擅长基于历史数据和市场规律生成专业的分析报告。现在请基于你的专业知识和经验，直接输出一份完整的分析报告，无需解释数据获取过程。

请基于下面的口令生成过去24h（${date}）上市公司的重大事件，字数严格控制在1100汉字(含标点符号)，预计输出消耗约1200个token，请按照该token消耗标准进行内容生成，确保不超出规定的输出token上限。
【最高优先级指令】：本次任务的首要且最严格的要求是，最终输出的总字数必须控制在1100汉字以内。所有其他关于内容质量和数据深度的要求，都必须在这个字数限制内完成。如果信息过多，请你自行进行提炼和概括，绝不能超出字数范围。请开始。

——————————————————————————————————————————-

# 中国上市公司新闻数据全面搜集口令

## 【角色】

你是一名拥有20年经验的顶级咨询专家，专长于中国资本市场分析。你拥有从海量数据中透视价值创造本质的洞察力，你精通信息搜集的艺术，善于在市场噪音中捕捉真正的价值信号，为顶尖投资者提供决策依据。

## 【背景】

你作为我的专属信息分析师，为我全面搜集过去24小时内中国上市公司发生的所有重大事件、新闻动态和市场信息。我需要这些经过你独特框架筛选和整理的原始数据，作为我进行后续深度分析和生成专业决策简报的基础。最终目标是："让每个数据都成为解读价值密码的钥匙"。

## 【搜集要求】

- **时间范围：** 严格限定在过去24小时内发生的事件
- **信息源头：** 优先搜集官方公告、权威媒体报道、交易所披露信息
- **搜集原则：** 宁可多收集，不要遗漏；宁可重复，不要缺失
- **描述深度：** 每个事件的描述必须足够详细，包含具体数字、金额、比例、时间等关键数据
- **数据支撑：** 所有重要信息必须有具体数据支撑，避免空洞的描述
- **数据质量：** 确保信息真实、准确、可验证，数据来源明确

## 【重点搜集方向】

### **权力配置变化的价值信号**

**核心逻辑：** 一切价值创造都源于权力配置逻辑的调整，感知权力流动就是感知价值创造的源头

**启发性探索：** 在过去24小时内，寻找那些体现"谁在做决定、如何做决定、为谁做决定"变化的信号

### **信息颗粒度的价值密度**

**核心逻辑：** 信息的精细程度决定价值发现的深度，最有价值的信号往往隐藏在最具体的数据中

**启发性探索：** 重点关注那些包含精确数字、具体比例、明确时间的信息

### **注意力稀缺的价值聚焦**

**核心逻辑：** 在信息过载的时代，注意力的聚集就是价值的放大，关注度决定价格的方向

**启发性探索：** 识别那些正在快速聚集市场注意力的事件和信号

### **风险透明化的系统进化**

**核心逻辑：** 风险的识别和处理过程就是市场自我完善的机制，透明度提升创造制度价值

**启发性探索：** 寻找那些体现市场自我纠错和制度进化的信号

### **价值创造的跃迁**

**核心逻辑：** 企业价值的变化不是线性渐进的，而是通过关键事件实现突变式跃升

**启发性探索：** 识别那些可能引发企业价值状态突变的关键事件

**统一引导原则：**

**以价值创造为核心，以数据精度为标准，以变化信号为重点，全面感知过去24小时内一切可能影响价值认知、价值创造、价值实现的信息，让每个数据都成为解读价值密码的钥匙。**

## 【搜集格式要求】

### **请按以下结构整理搜集到的信息，每项都必须包含详细数据：**

### **【一、市场数据部分】**

上证指数：[具体点位] ([涨跌幅±X.XX%])，成交额：[X.XX万亿元]，成交量：[X.XX亿股]

深证成指：[具体点位] ([涨跌幅±X.XX%])，成交额：[X.XX万亿元]，成交量：[X.XX亿股]

创业板指：[具体点位] ([涨跌幅±X.XX%])，成交额：[X.XX万亿元]，成交量：[X.XX亿股]

恒生指数：[具体点位] ([涨跌幅±X.XX%])，成交额：[X.XX万亿元]，成交量：[X.XX亿股]

市场总成交额：[X.XX万亿元]，较前一日[增加/减少X.XX%]

涨停股：[X]家，跌停股：[X]家，涨跌比：[X:X]

北向资金：[净流入/净流出X.XX亿元]，南向资金：[净流入/净流出X.XX亿元]

### **【二、宏观政策部分 - 每个政策都必须包含具体数据】**

[政策名称]：

- 具体内容：[详细政策条款和要求]
- 关键数据：[涉及金额/规模/比例/数量等具体数字]
- 实施时间：[具体日期和时间节点]
- 影响范围：[具体影响的行业数量、公司数量、市场规模]
- 历史对比：[与过往同类政策的数据对比]
- 市场反应：[相关板块涨跌幅、成交额变化]

### **【三、上市公司事件部分 - 每个事件都必须数据详实】**

[公司全称]([完整股票代码])：

- 事件类型：[具体分类]
- 事件详情：[详细描述，必须包含具体金额、比例、数量等关键数据]
- 关键数据：
- 涉及金额：[具体数额]
- 影响程度：[对营收/净利润的具体影响比例]
- 时间节点：[具体完成时间或进展时间]
- 比较数据：[同行业对比、历史对比数据]
- 市场表现：[公告日股价涨跌幅、成交量变化、市值变化]
- 公告时间：[具体发布时间]
- 信息来源：[具体来源渠道]

### **【四、热点板块部分 - 必须包含资金数据】**

[板块名称]：涨幅[X.XX%]，成交额[X.XX亿元]，换手率[X.XX%]

- 龙头股表现：[股票名称]([代码])，涨幅[X.XX%]，成交额[X.XX亿元]，市值[X.XX亿元]
- 板块内涨停数量：[X]家，平均涨幅：[X.XX%]
- 资金流向：主力净流入[X.XX亿元]，散户净流入[X.XX亿元]
- 驱动因素：[详细原因及相关数据支撑]
- 市场参与：机构参与度[X.XX%]，北向资金流入[X.XX亿元]

### **【五、异动风险部分】**

[公司名称]([代码])：[异动类型] - [详细情况]

## 【搜集策略建议】

1. **多渠道搜索：** 使用不同关键词组合搜索
2. **时间敏感：** 重点关注最新发布的信息
3. **热度优先：** 优先搜集讨论热度高的事件
4. **全面覆盖：** 大公司小公司都要关注
5. **交叉验证：** 重要信息多渠道确认

## 【特别强调】

- **数量要求：** 公司事件严格保持5个最热事件，宏观政策事件严格保持3个，不得有任何变动
- **质量要求：** 每个事件的描述必须包含具体的数字、金额、比例、时间等关键数据
- **数据完整性：** 不允许出现"大幅增长"、"显著提升"等模糊表述，必须有具体数字
- **时效要求：** 确保是过去24小时内发生或披露的事件
- **准确要求：** 公司名称、股票代码、数据必须准确无误
- **数据来源：** 每个重要数据都要标明来源，确保可验证性

**数据详实标准示例：**

- ❌ 错误："公司业绩大幅增长"
- ✅ 正确："公司2025年上半年净利润3.82亿元，同比增长247.5%，营收29.5亿元，同比增长84.8%"
- ❌ 错误："央行投放大量流动性"
- ✅ 正确："央行开展4000亿元MLF操作，期限1年，本月净投放1000亿元，为连续第5个月超额续作"

**请开始全面搜集，确保每个信息都有充分的数据支撑！**`;
}

function createPrompt(date) {
    return createSimplePrompt(date);
}

function showLoading() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('resultSection').style.display = 'none';
    document.getElementById('generateBtn').disabled = true;
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('generateBtn').disabled = false;
}

function showResult(content) {
    console.log('showResult 被调用，内容:', content);
    console.log('内容长度:', content ? content.length : 0);
    
    hideLoading();
    
    const formattedContent = formatContent(content);
    console.log('格式化后的内容:', formattedContent);
    
    const reportElement = document.getElementById('reportContent');
    console.log('reportContent 元素:', reportElement);
    
    reportElement.innerHTML = formattedContent;
    
    // 验证内容是否正确设置
    console.log('设置后的 innerHTML:', reportElement.innerHTML);
    
    document.getElementById('resultSection').style.display = 'block';
    console.log('resultSection 已显示');
}

function formatContent(content) {
    // 将纯文本转换为HTML格式，保持换行和缩进
    return content
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/^/, '<p>')
        .replace(/$/, '</p>')
        .replace(/【([^】]+)】/g, '<h3>【$1】</h3>')
        .replace(/##\s*([^\n]+)/g, '<h3>$1</h3>')
        .replace(/###\s*([^\n]+)/g, '<h4>$1</h4>');
}

function copyReport() {
    const content = document.getElementById('reportContent').innerText;
    navigator.clipboard.writeText(content).then(() => {
        const btn = document.getElementById('copyBtn');
        const originalText = btn.textContent;
        btn.textContent = '已复制！';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    }).catch(err => {
        console.error('复制失败:', err);
        alert('复制失败，请手动选择文本复制');
    });
}
