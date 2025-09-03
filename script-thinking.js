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
                        const delta = parsed.choices?.[0]?.delta || {};
                        // 优先接收 reasoning 流，展示为“思考过程”
                        if (delta.reasoning && isThinkingPhase) {
                            processChunk(delta.reasoning);
                        }
                        // 同时接收 content 流；当遇到 [REPORT_START] 会自动切换到报告区域
                        if (delta.content) {
                            processChunk(delta.content);
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
    
    // 备用分隔符列表 - 优先寻找中文报告标识
    const fallbackSeparators = [
        '### 【一、市场数据部分】',
        '## 【市场数据部分】',
        '### 【市场数据部分】',
        '# 【市场数据部分】',
        '【一、市场数据部分】',
        '【市场数据部分】',
        '上证指数：',
        '## 市场数据',
        '# 市场数据',
        '**市场数据**',
        '=== 市场数据 ===',
        '## 【一、',
        '### 【一、',
        '【一、',
        '今日股市',
        '股市分析',
        '市场回顾'
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
    
    // 寻找中文报告内容的特征模式
    const lines = content.split('\n');
    const chineseReportPatterns = [
        /^上证指数：.*[0-9]+.*[%％]/,
        /^深证成指：.*[0-9]+.*[%％]/,
        /^创业板指：.*[0-9]+.*[%％]/,
        /^北向资金：.*[0-9]+.*亿元/,
        /^南向资金：.*[0-9]+.*亿元/,
        /^【.*】.*[0-9]+/,
        /^## 【.*】/,
        /^### 【.*】/,
        /^.*成交额：.*万亿元/,
        /^.*涨跌幅.*%/
    ];
    
    // 从内容末尾开始向前寻找，因为报告通常在后面
    for (let i = lines.length - 1; i >= Math.floor(lines.length * 0.3); i--) {
        const line = lines[i].trim();
        
        // 检查是否匹配中文报告模式
        for (let pattern of chineseReportPatterns) {
            if (pattern.test(line)) {
                // 找到可能的报告起始点，向前寻找更合适的分割点
                let reportStart = i;
                
                // 向前寻找段落开始
                for (let j = i - 1; j >= 0; j--) {
                    const prevLine = lines[j].trim();
                    if (prevLine === '' || prevLine.includes('💭') || prevLine.includes('🔍')) {
                        reportStart = j + 1;
                        break;
                    }
                }
                
                console.log(`基于中文报告模式分离，匹配行: ${line}`);
                return {
                    thinking: lines.slice(0, reportStart).join('\n').trim(),
                    report: lines.slice(reportStart).join('\n').trim(),
                    method: '中文报告模式识别'
                };
            }
        }
    }
    
    // 如果没有找到模式，尝试寻找大段中文内容
    for (let i = Math.floor(lines.length * 0.4); i < lines.length - 5; i++) {
        const line = lines[i].trim();
        
        // 检查是否是大段中文内容的开始
        if (line.length > 20 && /^[\u4e00-\u9fa5]/.test(line) && 
            (line.includes('指数') || line.includes('市场') || line.includes('股票') || 
             line.includes('公司') || line.includes('政策') || line.includes('板块'))) {
            
            // 检查后续几行是否也是中文内容
            let chineseLineCount = 0;
            for (let j = i; j < Math.min(i + 10, lines.length); j++) {
                const checkLine = lines[j].trim();
                if (checkLine.length > 10 && /[\u4e00-\u9fa5]/.test(checkLine)) {
                    chineseLineCount++;
                }
            }
            
            if (chineseLineCount >= 3) {
                console.log(`基于中文内容特征分离，分离点: ${line}`);
                return {
                    thinking: lines.slice(0, i).join('\n').trim(),
                    report: lines.slice(i).join('\n').trim(),
                    method: '中文内容特征识别'
                };
            }
        }
    }
    
    // 最后的分离方法：按固定比例分离，但确保分离点不在英文内容中
    const contentLength = content.length;
    let cutPoint = Math.floor(contentLength * 0.6);
    
    // 向后查找到合适的中文内容开始点
    const searchText = content.substring(cutPoint);
    const chineseMatch = searchText.match(/[\u4e00-\u9fa5]{10,}/);
    if (chineseMatch) {
        cutPoint += chineseMatch.index;
    }
    
    console.log('使用优化的固定比例分离');
    return {
        thinking: content.substring(0, cutPoint).trim(),
        report: content.substring(cutPoint).trim(),
        method: '优化的固定比例分离'
    };
}

// 清理思考内容，移除提示词重复
function cleanThinkingContent(rawThinking) {
    // 移除明显的提示词重复内容
    const promptIndicators = [
        '请基于下面的口令生成',
        '【最高优先级指令】',
        '中国上市公司新闻数据全面搜集口令',
        '## 【角色】',
        '你是一名拥有20年经验的顶级咨询专家',
        '——————————————————————————————————————————-',
        '【搜集要求】',
        '【重点搜集方向】'
    ];
    
    let cleanedContent = rawThinking;
    
    // 查找第一个不包含提示词指示器的段落
    const lines = rawThinking.split('\n');
    let startIndex = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        let containsPrompt = false;
        
        for (const indicator of promptIndicators) {
            if (line.includes(indicator)) {
                containsPrompt = true;
                break;
            }
        }
        
        // 如果这一行不包含提示词内容，且不是空行，则从这里开始
        if (!containsPrompt && line.length > 0) {
            startIndex = i;
            break;
        }
    }
    
    // 如果找到了真正的思考开始点，则从那里开始提取
    if (startIndex > 0) {
        cleanedContent = lines.slice(startIndex).join('\n');
    }
    
    // 进一步清理：移除可能的search()函数调用显示
    cleanedContent = cleanedContent.replace(/search\([^)]*\)/g, '');
    cleanedContent = cleanedContent.replace(/💭 search\([^)]*\)/g, '');
    
    return cleanedContent.trim();
}

// 处理每个数据块
function processChunk(chunk) {
    if (isThinkingPhase) {
        thinkingContent += chunk;
        const separatorIndex = thinkingContent.indexOf('[REPORT_START]');
        if (separatorIndex !== -1) {
            isThinkingPhase = false;
            const reportPart = thinkingContent.substring(separatorIndex + '[REPORT_START]'.length);
            
            // 清理思考内容，移除提示词重复
            const rawThinking = thinkingContent.substring(0, separatorIndex);
            thinkingContent = cleanThinkingContent(rawThinking);
            
            updateThinkingContent();
            showResultSection();
            showStatus('正在生成最终报告...');
            finalContent = reportPart;
            updateFinalContent();
            console.log('检测到报告开始分隔符 [REPORT_START]');
        } else {
            // 早期启发式检测：无分隔符时，若检测到报告结构信号，提前切换到报告区
            const heuristicIndex = detectReportStartIndex(thinkingContent);
            if (heuristicIndex !== -1) {
                isThinkingPhase = false;
                const rawThinking = thinkingContent.substring(0, heuristicIndex);
                const reportPart = thinkingContent.substring(heuristicIndex);
                thinkingContent = cleanThinkingContent(rawThinking);
                updateThinkingContent();
                showResultSection();
                showStatus('检测到报告结构，开始输出最终报告...');
                finalContent = reportPart;
                updateFinalContent();
            } else {
                updateThinkingContent();
            }
        }
    } else {
        finalContent += chunk;
        updateFinalContent();
    }
}

// 从原始聚合的文本中安全切割报告段（避免已清理后的思考内容覆盖原文）
function thinkingContentOriginalSafeSlice(currentThinkingCleaned, cutIndexInOriginal) {
    // 我们无法直接拿到原始未清理文本的引用，此处简单策略：
    // 在切换到报告前，使用最近一次的 chunk 内容构造报告起点。
    // 作为权衡：当启发式触发时，报告已在末尾附近开始，后续的增量会继续追加到 finalContent。
    return '';
}

// 启发式检测报告起点（当模型未输出 [REPORT_START] 时）
function detectReportStartIndex(content) {
    // 借鉴 intelligentSeparation 的分隔符与中文特征，但更激进：一旦检测到明显的报告标题或关键行，就切换
    const candidates = [
        '### 【一、市场数据部分】', '## 【市场数据部分】', '### 【市场数据部分】', '【市场数据部分】',
        '上证指数：', '深证成指：', '创业板指：', '恒生指数：',
        '### 【', '## 【', '【一、', '【二、', '【三、', '【四、', '【五、'
    ];
    let minIndex = -1;
    for (const sep of candidates) {
        const idx = content.indexOf(sep);
        if (idx !== -1) {
            // 避免误触发：要求这一信号出现在文本的后半段
            if (idx > Math.floor(content.length * 0.35)) {
                minIndex = (minIndex === -1) ? idx : Math.min(minIndex, idx);
            }
        }
    }
    return minIndex;
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
                
                // 更新内容，并清理思考内容
                thinkingContent = cleanThinkingContent(separated.thinking);
                finalContent = separated.report;
                isThinkingPhase = false;
                
                // 更新显示
                updateThinkingContent();
                // 确保结果区可见（fallback 分支之前未显式打开）
                showResultSection();
                reportContent.innerHTML = `
                    <div style="background: #d4edda; border: 1px solid #c3e6cb; padding: 10px; margin-bottom: 15px; border-radius: 5px;">
                        <p style="margin: 0; color: #155724;">
                            ✅ <strong>智能分离成功</strong> - 使用${separated.method}成功分离内容
                        </p>
                    </div>
                    ${formatFinalContent(finalContent)}
                `;
                
                // 滚动到报告区域
                setTimeout(() => {
                    document.getElementById('resultSection').scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'start' 
                    });
                }, 300);
                
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
    return `请严格按下述流式输出协议工作，并遵守字数与结构约束：

【流式输出协议】
1) 先仅输出“思考过程”（逐步流式输出），可包含检索与推理要点；
2) 思考过程结束后，单独输出一行标记：[REPORT_START]
3) 从该行之后，连续输出“最终报告”正文，且正文中不包含任何思考或检索痕迹；
4) 不要等待全部内容生成完再输出，必须逐步流式输出；
5) 最终报告控制在1100汉字以内（含标点）。

【思考输出风格（非常重要）】
- 绝对不要复述或改写本任务的指令、格式或分节标题；
- 使用第一人称的内部独白，体现真实的分析路径与取舍；
- 用以下标记组织行：
  - 💭 内部判断：写3条当天市场关键假设（1行1条，含可能驱动因素）
  - 🔍 查询：写5条预期检索/关注的关键词（精确到公司/政策/板块/资金）
  - ➡️ 决策：写选择5条公司事件与3条政策的取舍理由（简洁要点化）
- 如需罗列数据口径或交叉验证思路，请简明扼要，不要出现“【一、市场数据部分】”这类模板用语；
- 思考总量建议≤300字，保持紧凑；

【最高优先级指令】最终报告总字数必须≤1100汉字。若信息过多，请精炼概括，绝不可超出字数。请开始。

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
