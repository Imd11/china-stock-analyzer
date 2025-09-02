const API_KEY = 'sk-DqlYesMKwBBmKYcGn0ZSYwGvh2lO7YdYm2lmUpblm8kGjxXp';
const API_URL = 'https://api.tu-zi.com/v1';
const PROXY_URL = 'http://127.0.0.1:3001';

// 全局变量存储内容
let thinkingContent = '';
let finalContent = '';
let isThinkingPhase = true;

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
    accumulatedBuffer = ''; // 重置缓冲区
    
    showLoading();
    hideResults();
    
    try {
        const prompt = createPrompt(date);
        await callOpenRouterAPIStream(prompt);
        
        // 流式处理完成后的最终处理
        finalizContent();
        
    } catch (error) {
        console.error('Error:', error);
        hideLoading();
        showError('生成报告时出现错误，请稍后重试');
    }
}

// 流式API调用
async function callOpenRouterAPIStream(prompt) {
    console.log('开始调用API (GPT-5-thinking-all)...');
    
    // 判断是本地开发还是线上环境
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
                temperature: 0.3,
                max_tokens: 8000, // 增加以容纳思考过程和完整报告
                stream: true
            })
        });
        
        console.log('API 响应状态:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('API 错误响应:', errorText);
            throw new Error(`API调用失败 (${response.status}): ${errorText}`);
        }
        
        // 处理流式响应
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        // 显示界面
        hideLoading();
        showThinkingSection();
        showStatus('正在接收AI响应...');
        
        while (true) {
            try {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                    // 忽略心跳信号
                    if (line.startsWith(':heartbeat')) continue;
                    
                    if (line.startsWith('data: ')) {
                        const data = line.substring(6);
                        
                        if (data === '[DONE]') {
                            console.log('流式响应完成');
                            finalizContent();
                            break;
                        }
                        
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.choices?.[0]?.delta?.content) {
                                const chunk = parsed.choices[0].delta.content;
                                processChunk(chunk);
                            }
                        } catch (e) {
                            // 忽略解析错误
                        }
                    }
                }
            } catch (readError) {
                console.error('读取流错误:', readError);
                // 如果有部分内容，仍然显示
                if (thinkingContent || finalContent) {
                    console.log('使用已接收的部分内容');
                    finalizContent();
                }
                break;
            }
        }
        
        console.log('思考内容长度:', thinkingContent.length);
        console.log('最终内容长度:', finalContent.length);
        
        // 确保内容被正确处理
        finalizContent();
        
    } catch (error) {
        console.error('API 调用详细错误:', error);
        throw error;
    }
}

// 智能内容分离检测器
class ContentSeparator {
    constructor() {
        this.reportStartMarkers = [
            // 明确的报告开始标志
            '【一、', '【二、', '【三、', '【四、', '【五、',
            '【市场数据', '【宏观政策', '【上市公司', '【热点板块',
            '上证指数：', '深证成指：', '创业板指：',
            '# 中国上市公司', '## 中国上市公司', '### 中国上市公司',
            
            // 通用报告格式
            '## 一、', '## 二、', '## 三、', '## 四、',
            '### 一、', '### 二、', '### 三、', '### 四、',
            
            // 分析报告常见开头
            '市场数据：', '数据分析：', '分析报告：',
            '以下是', '根据', '基于', '通过分析',
            
            // 结构化内容标志
            '---\n\n', '\n\n---', '\n\n##', '\n\n###',
            '\n\n# ', '\n\n**一、', '\n\n**二、'
        ];
        
        this.structuralElements = [
            '：', '】', '【', '##', '###', '**', '--', '>>',
            '涨幅', '跌幅', '成交额', '万亿', '亿元', '%', '±'
        ];
    }
    
    // 检测是否为报告开始
    detectReportStart(chunk, fullThinkingContent) {
        // 方法1：直接关键词匹配
        const hasDirectMarker = this.reportStartMarkers.some(marker => 
            chunk.includes(marker) || fullThinkingContent.includes(marker)
        );
        
        // 方法2：结构化内容密度检测
        const structuralDensity = this.calculateStructuralDensity(chunk);
        const isStructural = structuralDensity > 0.1; // 10%以上是结构化元素
        
        // 方法3：思考内容长度 + 结构化内容
        const isLongEnough = fullThinkingContent.length > 300;
        const hasStructure = isStructural && chunk.length > 20;
        
        // 方法4：检测明显的数据格式
        const hasDataFormat = /\d+[.%]|\d+[万亿]|\d{4}年\d{1,2}月|\d+:\d+|[+-]\d+[.%]/.test(chunk);
        
        return hasDirectMarker || (isLongEnough && hasStructure) || hasDataFormat;
    }
    
    // 计算结构化内容密度
    calculateStructuralDensity(text) {
        if (!text || text.length === 0) return 0;
        
        let structuralChars = 0;
        for (const element of this.structuralElements) {
            const matches = text.split(element).length - 1;
            structuralChars += matches * element.length;
        }
        
        return structuralChars / text.length;
    }
}

// 全局内容分离器
const contentSeparator = new ContentSeparator();

// 累积缓冲区，用于更准确的检测
let accumulatedBuffer = '';

// 处理每个数据块
function processChunk(chunk) {
    if (isThinkingPhase) {
        // 如果仍在思考阶段，将新数据块追加到思考内容中
        thinkingContent += chunk;
        
        // 检查思考内容中是否出现了分隔符
        const separatorIndex = thinkingContent.indexOf('[REPORT_START]');
        
        if (separatorIndex !== -1) {
            // 找到了分隔符，进行切换
            isThinkingPhase = false;
            
            // 从思考内容中分离出真正的报告内容
            const reportPart = thinkingContent.substring(separatorIndex + '[REPORT_START]'.length);
            // 更新思考内容，去掉报告部分和分隔符
            thinkingContent = thinkingContent.substring(0, separatorIndex);
            
            // 更新UI
            updateThinkingContent(); // 更新最后的思考部分
            showResultSection();
            showStatus('正在生成最终报告...');
            
            // 将报告内容添加到finalContent
            finalContent = reportPart;
            updateFinalContent();
            
            console.log('检测到报告开始分隔符 [REPORT_START]');
        } else {
            // 未找到分隔符，仅更新思考内容的显示
            updateThinkingContent();
        }
    } else {
        // 已经进入报告阶段，直接追加内容到报告
        finalContent += chunk;
        updateFinalContent();
    }
}

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
    // 将思考内容分块显示
    let formatted = content
        // 高亮 > 开头的思考行
        .replace(/^> (.+)$/gm, '<div class="thinking-block">💭 $1</div>')
        // 高亮搜索查询
        .replace(/```[\s\S]*?```/g, (match) => {
            return '<div class="search-block">🔍 ' + match.replace(/```/g, '') + '</div>';
        })
        // 处理其他格式
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
    const reportContent = document.getElementById('reportContent');
    
    // 如果没有最终内容但有累积缓冲区，尝试从中提取报告
    if (!finalContent && accumulatedBuffer) {
        console.log('尝试从累积缓冲区提取报告');
        
        // 查找报告开始的位置
        const reportMarkers = [
            '\n以下是', '以下是',
            '\n---\n', '---\n',
            '\n## ', '## ',
            '\n### ', '### ',
            '*Thought for'
        ];
        
        let reportStartIndex = -1;
        let foundMarker = '';
        
        for (const marker of reportMarkers) {
            const index = accumulatedBuffer.indexOf(marker);
            if (index !== -1 && (reportStartIndex === -1 || index < reportStartIndex)) {
                reportStartIndex = index;
                foundMarker = marker;
            }
        }
        
        if (reportStartIndex !== -1) {
            // 找到报告开始位置
            console.log('找到报告标记:', foundMarker, '位置:', reportStartIndex);
            
            // 如果是思考时间标记，找到它之后的内容
            if (foundMarker === '*Thought for') {
                const afterThought = accumulatedBuffer.indexOf('\n', reportStartIndex);
                if (afterThought !== -1) {
                    finalContent = accumulatedBuffer.substring(afterThought + 1).trim();
                }
            } else {
                finalContent = accumulatedBuffer.substring(reportStartIndex).trim();
            }
            
            // 更新思考内容（去掉报告部分）
            thinkingContent = accumulatedBuffer.substring(0, reportStartIndex);
        } else {
            // 没找到明确标记，使用整个内容
            console.log('未找到明确报告标记，使用全部内容');
            finalContent = accumulatedBuffer;
        }
        
        showResultSection();
    }
    
    // 如果还是没有最终内容，使用思考内容
    if (!finalContent && thinkingContent) {
        console.log('使用思考内容作为报告，内容长度:', thinkingContent.length);
        finalContent = thinkingContent;
        showResultSection();
    }
    
    if (finalContent) {
        // 清理内容，移除明显的思考过程标记
        let cleanedContent = finalContent
            .replace(/^[\s\S]*?(?=【|上证指数|深证成指|中国上市公司|市场数据)/m, '') // 移除开头的思考内容
            .replace(/^.*?思考.*?\n/gm, '') // 移除包含"思考"的行
            .replace(/^.*?分析.*?\n/gm, '') // 移除包含"分析"的纯分析行
            .trim();
        
        // 如果清理后内容太短，使用原始内容
        if (cleanedContent.length < 500) {
            cleanedContent = finalContent;
        }
        
        reportContent.innerHTML = formatFinalContent(cleanedContent);
    } else {
        reportContent.innerHTML = '<p style="color: #ef4444;">生成报告失败，请重试。</p>';
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
    
    // 转换标题
    markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
    markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
    markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
    markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
    
    // 转换段落
    markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
    
    // 转换换行
    markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
    
    // 移除其他HTML标签
    markdown = markdown.replace(/<[^>]+>/g, '');
    
    // 转换HTML实体
    markdown = markdown.replace(/&nbsp;/g, ' ');
    markdown = markdown.replace(/&lt;/g, '<');
    markdown = markdown.replace(/&gt;/g, '>');
    markdown = markdown.replace(/&amp;/g, '&');
    markdown = markdown.replace(/&quot;/g, '"');
    
    // 清理多余的空行
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    
    return markdown.trim();
}

// 下载报告
function downloadReport() {
    // 获取原始内容或格式化的内容
    const htmlContent = document.getElementById('reportContent').innerHTML;
    const markdownContent = htmlToMarkdown(htmlContent);
    
    const date = document.getElementById('date').value;
    const filename = `上市公司日报_${date}.md`;
    
    // 添加标题和元信息
    const fullContent = `# 中国上市公司重大事件分析报告\n\n` +
                       `**生成日期**: ${new Date().toLocaleDateString('zh-CN')}\n` +
                       `**数据日期**: ${date}\n` +
                       `**技术支持**: GPT-5-thinking-all\n\n` +
                       `---\n\n` +
                       markdownContent +
                       `\n\n---\n\n` +
                       `*本报告由AI自动生成，仅供参考。投资决策请以官方信息为准。*`;
    
    // 创建Blob对象
    const blob = new Blob([fullContent], { type: 'text/markdown;charset=utf-8' });
    
    // 创建下载链接
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    
    // 触发下载
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // 释放URL对象
    URL.revokeObjectURL(url);
    
    // 更新按钮状态
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
    return `【重要指令】请严格遵守以下输出格式：
1.  首先，进行你的思考过程，思考过程的每一行都必须以 ">" 符号开头。
2.  在思考过程完全结束后，必须输出一个且仅一个的分隔符："[REPORT_START]"。
3.  分隔符之后，直接开始输出最终的、格式化的分析报告，不要包含任何额外的解释或思考。

【角色设定】你是一名专业的金融数据分析师，擅长基于历史数据和市场规律生成专业的分析报告。

请基于下面的口令生成过去24h（${date}）上市公司的重大事件，字数严格控制在1100汉字(含标点符号)。

# 中国上市公司新闻数据全面搜集口令

## 【角色】
你是一名拥有20年经验的顶级咨询专家，专长于中国资本市场分析。

## 【背景】
为我全面搜集过去24小时内中国上市公司发生的所有重大事件、新闻动态和市场信息。

## 【搜集格式要求】

### 【一、市场数据部分】
上证指数：[具体点位] ([涨跌幅±X.XX%])，成交额：[X.XX万亿元]
深证成指：[具体点位] ([涨跌幅±X.XX%])，成交额：[X.XX万亿元]
创业板指：[具体点位] ([涨跌幅±X.XX%])，成交额：[X.XX万亿元]
北向资金：[净流入/净流出X.XX亿元]，南向资金：[净流入/净流出X.XX亿元]

### 【二、宏观政策部分】（3个政策）
[政策名称]：
- 具体内容：[详细政策条款]
- 关键数据：[涉及金额/规模等]
- 影响范围：[影响的行业、公司数量]

### 【三、上市公司事件部分】（5个事件）
[公司全称]([股票代码])：
- 事件类型：[具体分类]
- 事件详情：[必须包含具体金额、比例等关键数据]
- 市场表现：[股价涨跌幅、成交量变化]

### 【四、热点板块部分】
[板块名称]：涨幅[X.XX%]，成交额[X.XX亿元]
- 龙头股表现：[股票名称]([代码])，涨幅[X.XX%]
- 资金流向：主力净流入[X.XX亿元]

请确保所有数据准确、具体，不使用模糊表述。`;
}

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
    // 将思考内容分块显示
    let formatted = content
        // 高亮 > 开头的思考行
        .replace(/^> (.+)$/gm, '<div class="thinking-block">💭 $1</div>')
        // 高亮搜索查询
        .replace(/```[\s\S]*?```/g, (match) => {
            return '<div class="search-block">🔍 ' + match.replace(/```/g, '') + '</div>';
        })
        // 处理其他格式
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
    const reportContent = document.getElementById('reportContent');
    
    // 如果没有最终内容但有累积缓冲区，尝试从中提取报告
    if (!finalContent && accumulatedBuffer) {
        console.log('尝试从累积缓冲区提取报告');
        
        // 查找报告开始的位置
        const reportMarkers = [
            '\n以下是', '以下是',
            '\n---\n', '---\n',
            '\n## ', '## ',
            '\n### ', '### ',
            '*Thought for'
        ];
        
        let reportStartIndex = -1;
        let foundMarker = '';
        
        for (const marker of reportMarkers) {
            const index = accumulatedBuffer.indexOf(marker);
            if (index !== -1 && (reportStartIndex === -1 || index < reportStartIndex)) {
                reportStartIndex = index;
                foundMarker = marker;
            }
        }
        
        if (reportStartIndex !== -1) {
            // 找到报告开始位置
            console.log('找到报告标记:', foundMarker, '位置:', reportStartIndex);
            
            // 如果是思考时间标记，找到它之后的内容
            if (foundMarker === '*Thought for') {
                const afterThought = accumulatedBuffer.indexOf('\n', reportStartIndex);
                if (afterThought !== -1) {
                    finalContent = accumulatedBuffer.substring(afterThought + 1).trim();
                }
            } else {
                finalContent = accumulatedBuffer.substring(reportStartIndex).trim();
            }
            
            // 更新思考内容（去掉报告部分）
            thinkingContent = accumulatedBuffer.substring(0, reportStartIndex);
        } else {
            // 没找到明确标记，使用整个内容
            console.log('未找到明确报告标记，使用全部内容');
            finalContent = accumulatedBuffer;
        }
        
        showResultSection();
    }
    
    // 如果还是没有最终内容，使用思考内容
    if (!finalContent && thinkingContent) {
        console.log('使用思考内容作为报告，内容长度:', thinkingContent.length);
        finalContent = thinkingContent;
        showResultSection();
    }
    
    if (finalContent) {
        // 清理内容，移除明显的思考过程标记
        let cleanedContent = finalContent
            .replace(/^[\s\S]*?(?=【|上证指数|深证成指|中国上市公司|市场数据)/m, '') // 移除开头的思考内容
            .replace(/^.*?思考.*?\n/gm, '') // 移除包含"思考"的行
            .replace(/^.*?分析.*?\n/gm, '') // 移除包含"分析"的纯分析行
            .trim();
        
        // 如果清理后内容太短，使用原始内容
        if (cleanedContent.length < 500) {
            cleanedContent = finalContent;
        }
        
        reportContent.innerHTML = formatFinalContent(cleanedContent);
    } else {
        reportContent.innerHTML = '<p style="color: #ef4444;">生成报告失败，请重试。</p>';
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
    
    // 转换标题
    markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
    markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
    markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
    markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
    
    // 转换段落
    markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
    
    // 转换换行
    markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
    
    // 移除其他HTML标签
    markdown = markdown.replace(/<[^>]+>/g, '');
    
    // 转换HTML实体
    markdown = markdown.replace(/&nbsp;/g, ' ');
    markdown = markdown.replace(/&lt;/g, '<');
    markdown = markdown.replace(/&gt;/g, '>');
    markdown = markdown.replace(/&amp;/g, '&');
    markdown = markdown.replace(/&quot;/g, '"');
    
    // 清理多余的空行
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    
    return markdown.trim();
}

// 下载报告
function downloadReport() {
    // 获取原始内容或格式化的内容
    const htmlContent = document.getElementById('reportContent').innerHTML;
    const markdownContent = htmlToMarkdown(htmlContent);
    
    const date = document.getElementById('date').value;
    const filename = `上市公司日报_${date}.md`;
    
    // 添加标题和元信息
    const fullContent = `# 中国上市公司重大事件分析报告\n\n` +
                       `**生成日期**: ${new Date().toLocaleDateString('zh-CN')}\n` +
                       `**数据日期**: ${date}\n` +
                       `**技术支持**: GPT-5-thinking-all\n\n` +
                       `---\n\n` +
                       markdownContent + 
                       `\n\n---\n\n` +
                       `*本报告由AI自动生成，仅供参考。投资决策请以官方信息为准。*`;
    
    // 创建Blob对象
    const blob = new Blob([fullContent], { type: 'text/markdown;charset=utf-8' });
    
    // 创建下载链接
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    
    // 触发下载
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // 释放URL对象
    URL.revokeObjectURL(url);
    
    // 更新按钮状态
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
你是一名拥有20年经验的顶级咨询专家，专长于中国资本市场分析。

## 【背景】
为我全面搜集过去24小时内中国上市公司发生的所有重大事件、新闻动态和市场信息。

## 【搜集格式要求】

### 【一、市场数据部分】
上证指数：[具体点位] ([涨跌幅±X.XX%])，成交额：[X.XX万亿元]
深证成指：[具体点位] ([涨跌幅±X.XX%])，成交额：[X.XX万亿元]
创业板指：[具体点位] ([涨跌幅±X.XX%])，成交额：[X.XX万亿元]
北向资金：[净流入/净流出X.XX亿元]，南向资金：[净流入/净流出X.XX亿元]

### 【二、宏观政策部分】（3个政策）
[政策名称]：
- 具体内容：[详细政策条款]
- 关键数据：[涉及金额/规模等]
- 影响范围：[影响的行业、公司数量]

### 【三、上市公司事件部分】（5个事件）
[公司全称]([股票代码])：
- 事件类型：[具体分类]
- 事件详情：[必须包含具体金额、比例等关键数据]
- 市场表现：[股价涨跌幅、成交量变化]

### 【四、热点板块部分】
[板块名称]：涨幅[X.XX%]，成交额[X.XX亿元]
- 龙头股表现：[股票名称]([代码])，涨幅[X.XX%]
- 资金流向：主力净流入[X.XX亿元]

请确保所有数据准确、具体，不使用模糊表述。`;
}