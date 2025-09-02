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

// 处理每个数据块
function processChunk(chunk) {
    // 简化的内容处理：前面少量内容作为思考过程，其余作为最终报告
    if (isThinkingPhase) {
        thinkingContent += chunk;
        updateThinkingContent();
        
        // 思考内容达到一定长度后，后续内容都作为最终报告
        if (thinkingContent.length > 500) {
            console.log('切换到最终内容阶段，思考内容长度:', thinkingContent.length);
            isThinkingPhase = false;
            showResultSection();
            showStatus('正在生成最终报告...');
            
            // 将当前chunk也添加到最终内容
            finalContent += chunk;
            updateFinalContent();
        }
    } else {
        // 最终内容阶段
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
    
    // 如果没有最终内容，将所有思考内容作为报告（去掉思考标记）
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
    return `【角色设定】你是一名专业的金融数据分析师，擅长基于历史数据和市场规律生成专业的分析报告。现在请基于你的专业知识和经验，直接输出一份完整的分析报告，无需解释数据获取过程。

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