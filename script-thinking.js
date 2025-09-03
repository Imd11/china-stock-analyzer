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
                temperature: 0.3,
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
                        if (parsed.choices?.[0]?.delta?.content) {
                            processChunk(parsed.choices[0].delta.content);
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

// 智能分离内容函数 - 备用机制
function intelligentSeparation(content) {
    console.log('尝试智能分离内容...');
    
    // 备用分隔符列表
    const fallbackSeparators = [
        '### 【一、市场数据部分】',
        '## 【市场数据部分】',
        '**市场数据**',
        '上证指数：',
        '【市场数据】',
        '=== 报告正文 ===',
        '报告正文',
        '分析报告',
        '今日重点',
        '# 中国上市公司'
    ];
    
    for (let separator of fallbackSeparators) {
        const index = content.indexOf(separator);
        if (index !== -1) {
            console.log(`找到备用分隔符: ${separator}`);
            return {
                thinking: content.substring(0, index).trim(),
                report: content.substring(index).trim(),
                method: `备用分隔符: ${separator}`
            };
        }
    }
    
    // 基于长度的智能分离（假设思考过程通常占70%）
    const lines = content.split('\n');
    if (lines.length > 10) {
        const cutPoint = Math.floor(lines.length * 0.7);
        // 从70%位置开始，寻找像报告开始的行
        for (let i = cutPoint; i < lines.length - 2; i++) {
            const line = lines[i].trim();
            if (line.includes('上证指数') || line.includes('市场数据') || 
                line.includes('【一、') || line.includes('### ') ||
                (line.length > 10 && line.includes('：') && line.includes('%'))) {
                console.log(`基于内容特征分离，分离点: ${line}`);
                return {
                    thinking: lines.slice(0, i).join('\n').trim(),
                    report: lines.slice(i).join('\n').trim(),
                    method: '基于内容特征分离'
                };
            }
        }
    }
    
    // 最后的分离方法：按固定比例分离
    const contentLength = content.length;
    const cutPoint = Math.floor(contentLength * 0.6);
    console.log('使用固定比例分离 (60%/40%)');
    return {
        thinking: content.substring(0, cutPoint).trim(),
        report: content.substring(cutPoint).trim(),
        method: '固定比例分离 (60%/40%)'
    };
}

// 处理每个数据块
function processChunk(chunk) {
    if (isThinkingPhase) {
        thinkingContent += chunk;
        const separatorIndex = thinkingContent.indexOf('[REPORT_START]');
        if (separatorIndex !== -1) {
            isThinkingPhase = false;
            const reportPart = thinkingContent.substring(separatorIndex + '[REPORT_START]'.length);
            thinkingContent = thinkingContent.substring(0, separatorIndex);
            updateThinkingContent();
            showResultSection();
            showStatus('正在生成最终报告...');
            finalContent = reportPart;
            updateFinalContent();
            console.log('检测到报告开始分隔符 [REPORT_START]');
        } else {
            updateThinkingContent();
        }
    } else {
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
    let formatted = content
        .replace(/^> (.*)$/gm, '<div class="thinking-block">💭 $1</div>')
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
    const reportContent = document.getElementById('reportContent');
    
    // 添加详细的调试信息
    console.log('=== 调试信息 ===');
    console.log('thinkingContent 长度:', thinkingContent.length);
    console.log('finalContent 长度:', finalContent.length);
    console.log('isThinkingPhase:', isThinkingPhase);
    console.log('thinkingContent 最后200字符:', thinkingContent.slice(-200));
    console.log('是否包含分隔符:', thinkingContent.includes('[REPORT_START]'));
    console.log('分隔符位置:', thinkingContent.indexOf('[REPORT_START]'));
    
    if (finalContent) {
        reportContent.innerHTML = formatFinalContent(finalContent);
    } else if (isThinkingPhase) {
        console.error('AI failed to produce a report. The separator [REPORT_START] was not found.');
        
        // 如果有内容，尝试智能分离
        if (thinkingContent && thinkingContent.length > 200) {
            console.log('启用备用分离机制...');
            const separated = intelligentSeparation(thinkingContent);
            
            if (separated.report && separated.report.length > 50) {
                console.log(`智能分离成功，使用方法: ${separated.method}`);
                
                // 更新内容
                thinkingContent = separated.thinking;
                finalContent = separated.report;
                isThinkingPhase = false;
                
                // 更新显示
                updateThinkingContent();
                reportContent.innerHTML = `
                    <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; margin-bottom: 15px; border-radius: 5px;">
                        <p style="margin: 0; color: #856404;">
                            ⚠️ <strong>备用分离机制已启用</strong> - 使用${separated.method}成功分离内容
                        </p>
                    </div>
                    ${formatFinalContent(finalContent)}
                `;
                
                hideStatus();
                return;
            }
        }
        
        // 显示更详细的错误信息和调试提示
        reportContent.innerHTML = `
            <div style="color: #ef4444; margin-bottom: 20px;">
                <h3>调试信息</h3>
                <p><strong>错误：</strong>AI未能生成格式化的报告。分隔符 [REPORT_START] 未找到。</p>
                <p><strong>思考内容长度：</strong>${thinkingContent.length} 字符</p>
                <p><strong>是否包含分隔符：</strong>${thinkingContent.includes('[REPORT_START]') ? '是' : '否'}</p>
                <p><strong>备用分离：</strong>已尝试但失败</p>
                <p><strong>解决方案：</strong>请打开F12控制台查看完整调试信息，或尝试重新生成报告。</p>
            </div>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin-top: 15px;">
                <p><strong>AI响应的最后200字符：</strong></p>
                <pre style="white-space: pre-wrap; font-size: 12px;">${thinkingContent.slice(-200)}</pre>
            </div>
        `;
        
        if (!thinkingContent) {
           showThinkingSection();
           document.getElementById('thinkingText').innerHTML = '<p>没有收到任何来自AI的输出。</p>';
        }
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
    const htmlContent = document.getElementById('reportContent').innerHTML;
    const markdownContent = htmlToMarkdown(htmlContent);
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
    return `🚨🚨🚨【CRITICAL】输出格式强制要求🚨🚨🚨

你的回应必须分为两个部分：
1️⃣ 第一部分：你的思考过程和搜索过程
2️⃣ 第二部分：最终的分析报告

⚠️ 重要：当你完成思考过程后，必须在单独一行输出以下分隔符：
[REPORT_START]

这个分隔符是强制性的，不可省略！

🚨🚨🚨【CRITICAL】输出格式强制要求🚨🚨🚨

【角色设定】你是一名专业的金融数据分析师。
【任务】请基于下面的口令生成过去24h（${date}）上市公司的重大事件分析报告。

# 中国上市公司新闻数据全面搜集口令

## 【角色】
你是一名拥有20年经验的顶级咨询专家，专长于中国资本市场分析。

## 【背景】
为我全面搜集过去24小时内中国上市公司发生的所有重大事件、新闻动态和市场信息。

⭐⭐⭐ 记住：完成思考后必须输出 [REPORT_START] 分隔符！⭐⭐⭐

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

请确保所有数据准确、具体，不使用模糊表述。最终报告的字数严格控制在1100汉字(含标点符号)。

🔥🔥🔥【最终提醒】🔥🔥🔥
完成思考过程后，在新行输出：[REPORT_START]
然后再输出最终报告！
不要忘记这个分隔符！
🔥🔥🔥【最终提醒】🔥🔥🔥`;
}