const API_KEY = 'sk-DqlYesMKwBBmKYcGn0ZSYwGvh2lO7YdYm2lmUpblm8kGjxXp';
const API_URL = 'https://api.tu-zi.com/v1';
const PROXY_URL = 'http://127.0.0.1:3001';

// 全局变量存储内容
let thinkingContent = '';
let finalContent = '';

document.addEventListener('DOMContentLoaded', function() {
    const dateInput = document.getElementById('date');
    const generateBtn = document.getElementById('generateBtn');
    const loading = document.getElementById('loading');
    const thinkingSection = document.getElementById('thinkingSection');
    const resultSection = document.getElementById('resultSection');
    const statusBar = document.getElementById('statusBar');
    const copyBtn = document.getElementById('copyBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const toggleThinking = document.getElementById('toggleThinking');
    
    // 设置默认日期为今天
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    
    // 事件监听器
    generateBtn.addEventListener('click', generateReport);
    copyBtn.addEventListener('click', copyReport);
    downloadBtn.addEventListener('click', downloadReport);
    toggleThinking.addEventListener('click', toggleThinkingContent);
});

// 切换思考内容显示/隐藏
function toggleThinkingContent() {
    const thinkingContent = document.getElementById('thinkingContent');
    const toggleBtn = document.getElementById('toggleThinking');
    
    if (thinkingContent.classList.contains('collapsed')) {
        thinkingContent.classList.remove('collapsed');
        toggleBtn.textContent = '折叠';
    } else {
        thinkingContent.classList.add('collapsed');
        toggleBtn.textContent = '展开';
    }
}


// 生成报告
async function generateReport() {
    const date = document.getElementById('date').value;
    if (!date) {
        alert('请选择日期');
        return;
    }
    
    // 重置内容
    thinkingContent = '';
    finalContent = '';
    isThinkingPhase = true;
    
    showLoading();
    hideResults();
    
    try {
        const prompt = createPrompt(date);
        await callOpenRouterAPIStream(prompt);
        
    } catch (error) {
        console.error('Error:', error);
        hideLoading();
        showError('生成报告时出现错误，请稍后重试');
    }
}

// 流式API调用
async function callOpenRouterAPIStream(prompt) {
    console.log('开始调用API (GPT-5-thinking-all)...');
    
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const apiUrl = isLocal ? PROXY_URL + '/api/chat/completions' : '/api/chat';
    console.log('API URL:', apiUrl);
    
    try {
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
                temperature: 0.7,
                max_tokens: 8000,
                stream: true
            })
        });
        
        console.log('API 响应状态:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('API 错误响应:', errorText);
            throw new Error(`API调用失败 (${response.status}): ${errorText}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        hideLoading();
        showThinkingSection();
        showStatus('正在接收AI响应...');
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                finalizContent();
                break;
            }
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.substring(6);
                    if (data === '[DONE]') {
                        finalizContent();
                        return;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        const delta = parsed.choices?.[0]?.delta || {};
                        
                        // reasoning 流：AI的真实思考过程，直接放到思考区域
                        if (delta.reasoning) {
                            thinkingContent += delta.reasoning;
                            updateThinkingContent();
                            
                            // 如果思考区域还未显示，现在显示它
                            if (document.getElementById('thinkingSection').style.display === 'none') {
                                showThinkingSection();
                                showStatus('AI正在思考分析...');
                            }
                        }
                        
                        // content 流：最终的结构化报告，直接放到报告区域
                        if (delta.content) {
                            finalContent += delta.content;
                            updateFinalContent();
                            
                            // 如果报告区域还未显示，现在显示它
                            if (document.getElementById('resultSection').style.display === 'none') {
                                showResultSection();
                                showStatus('正在生成最终报告...');
                            }
                        }
                    } catch (e) {
                        // Ignore parsing errors
                    }
                }
            }
        }
    } catch (error) {
        console.error('API 调用详细错误:', error);
        throw error;
    }
}

// 已移除以下不再需要的函数：
// - intelligentSeparation: 不再需要内容分离
// - cleanThinkingContent: AI的思考内容直接显示
// - sanitizeThinkingChunk: AI的原生输出直接使用

// 已移除processChunk、thinkingContentOriginalSafeSlice和detectReportStartIndex函数
// 现在使用GPT-5-thinking-all的原生双流输出，不需要人为分离

// 更新思考内容显示
function updateThinkingContent() {
    const thinkingText = document.getElementById('thinkingText');
    thinkingText.innerHTML = formatThinkingContent(thinkingContent);
}

// 更新最终内容显示
function updateFinalContent() {
    const reportContent = document.getElementById('reportContent');
    reportContent.innerHTML = formatFinalContent(finalContent) + '<span class="streaming-cursor">▊</span>';
}

// 格式化思考内容
function formatThinkingContent(content) {
    // 行级处理：支持三类显式标记 + 引用样式
    const lines = content.split('\n');
    const out = lines.map(line => {
        const t = line.trim();
        if (!t) return '';
        if (t.startsWith('💭')) {
            return `<div class="thinking-block">${t}</div>`;
        }
        if (t.startsWith('🔍')) {
            return `<div class="search-block">${t}</div>`;
        }
        if (t.startsWith('> ')) {
            return `<div class="thinking-block">💭 ${t.slice(2)}</div>`;
        }
        return t;
    });
    // 代码块转换为“搜索块/数据块”
    let formatted = out.join('\n')
        .replace(/```[\s\S]*?```/g, (match) => {
            return '<div class="search-block">🔍 ' + match.replace(/```/g, '') + '</div>';
        })
        .replace(/\n/g, '<br>');
    return formatted;
}

// 格式化最终内容
function formatFinalContent(content) {
    return content
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/^/, '<p>')
        .replace(/$/, '</p>')
        .replace(/【([^】]+)】/g, '<h3>【$1】</h3>')
        .replace(/##\s*([^\n]+)/g, '<h3>$1</h3>')
        .replace(/###\s*([^\n]+)/g, '<h4>$1</h4>');
}

// 完成内容处理
function finalizContent() {
    // 移除流式显示的光标
    const reportContent = document.getElementById('reportContent');
    if (reportContent && finalContent) {
        reportContent.innerHTML = formatFinalContent(finalContent);
    }
    
    // 移除思考区域的任何临时标记
    const thinkingText = document.getElementById('thinkingText');
    if (thinkingText && thinkingContent) {
        thinkingText.innerHTML = formatThinkingContent(thinkingContent);
    }
    
    // 日志输出，方便调试
    console.log('=== 生成完成 ===');
    console.log('思考内容长度:', thinkingContent.length);
    console.log('报告内容长度:', finalContent.length);
    
    // 如果没有收到任何内容，显示错误信息
    if (!thinkingContent && !finalContent) {
        reportContent.innerHTML = '<p style="color: #ef4444;">未收到AI响应，请检查网络连接后重试。</p>';
    }
    
    hideStatus();
}


// 复制报告
function copyReport() {
    const content = finalContent || document.getElementById('reportContent').innerText;
    navigator.clipboard.writeText(content).then(() => {
        const btn = document.getElementById('copyBtn');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '✓ 已复制！';
        setTimeout(() => {
            btn.innerHTML = originalHTML;
        }, 2000);
    }).catch(err => {
        console.error('复制失败:', err);
        alert('复制失败，请手动选择文本复制');
    });
}

// 将HTML内容转换为Markdown
function htmlToMarkdown(html) {
    let markdown = html;
    markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
    markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
    markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
    markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
    markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
    markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
    markdown = markdown.replace(/<[^>]+>/g, '');
    markdown = markdown.replace(/&nbsp;/g, ' ');
    markdown = markdown.replace(/&lt;/g, '<');
    markdown = markdown.replace(/&gt;/g, '>');
    markdown = markdown.replace(/&amp;/g, '&');
    markdown = markdown.replace(/&quot;/g, '"');
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    return markdown.trim();
}

// 下载报告
function downloadReport() {
    // 优先使用内存中的最终内容，避免DOM为空或含流式光标
    let htmlContent = '';
    if (finalContent && finalContent.trim().length > 0) {
        htmlContent = formatFinalContent(finalContent);
    } else {
        htmlContent = document.getElementById('reportContent').innerHTML || '';
    }

    // 将HTML转换为Markdown
    let markdownContent = htmlToMarkdown(htmlContent);
    // 兜底：若转换后仍为空，改用纯文本
    if (!markdownContent || markdownContent.trim().length === 0) {
        const fallbackText = finalContent && finalContent.trim().length > 0
            ? finalContent
            : (document.getElementById('reportContent').innerText || '');
        markdownContent = fallbackText;
    }
    const date = document.getElementById('date').value;
    const filename = `上市公司日报_${date}.md`;
    const fullContent = `# 中国上市公司重大事件分析报告\n\n` +
                       `**生成日期**: ${new Date().toLocaleDateString('zh-CN')}\n` +
                       `**数据日期**: ${date}\n` +
                       `**技术支持**: GPT-5-thinking-all\n\n` +
                       `---\n\n` +
                       markdownContent + 
                       `\n\n---\n\n` +
                       `*本报告由AI自动生成，仅供参考。投资决策请以官方信息为准。*`;
    const blob = new Blob([fullContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    const btn = document.getElementById('downloadBtn');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '✓ 已下载！';
    setTimeout(() => {
        btn.innerHTML = originalHTML;
    }, 2000);
}

// UI控制函数
function showLoading() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('generateBtn').disabled = true;
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('generateBtn').disabled = false;
}

function showThinkingSection() {
    document.getElementById('thinkingSection').style.display = 'block';
}

function showResultSection() {
    document.getElementById('resultSection').style.display = 'block';
}

function hideResults() {
    document.getElementById('thinkingSection').style.display = 'none';
    document.getElementById('resultSection').style.display = 'none';
    document.getElementById('statusBar').style.display = 'none';
}

function showStatus(text) {
    const statusBar = document.getElementById('statusBar');
    const statusText = document.getElementById('statusText');
    statusBar.style.display = 'block';
    statusText.textContent = text;
}

function hideStatus() {
    document.getElementById('statusBar').style.display = 'none';
}

function showError(message) {
    alert(message);
}

// 创建提示词
function createPrompt(date) {
    return `请基于下面的口令生成过去24h（${date}）上市公司的重大事件，字数严格控制在1100汉字(含标点符号)，预计输出消耗约1200个token，请按照该token消耗标准进行内容生成，确保不超出规定的输出token上限。
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
