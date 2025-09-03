const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const https = require('https');
const http = require('http');

const app = express();
const PORT = 3001;

// 兔子API配置
const API_KEY = 'sk-DqlYesMKwBBmKYcGn0ZSYwGvh2lO7YdYm2lmUpblm8kGjxXp';
const API_URL = 'https://api.tu-zi.com/v1/chat/completions';

// 启用CORS和JSON解析
app.use(cors({
    origin: ['http://127.0.0.1:3000', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// 创建自定义的HTTP/HTTPS代理
const httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 10,
    maxFreeSockets: 5,
    timeout: 120000, // 流式请求需要更长超时
    freeSocketTimeout: 60000,
    rejectUnauthorized: true
});

// 流式代理API请求
app.post('/api/chat/completions', async (req, res) => {
    console.log('收到流式代理请求:', {
        model: req.body.model,
        messages: req.body.messages?.length || 0,
        stream: req.body.stream,
        timestamp: new Date().toISOString()
    });

    // 确保请求为流式
    const requestBody = {
        ...req.body,
        stream: true
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`,
                'User-Agent': 'Stock-Analyzer-Proxy/1.0',
                'Accept': 'text/event-stream',
                'Connection': 'keep-alive'
            },
            body: JSON.stringify(requestBody),
            agent: httpsAgent,
            timeout: 120000
        });

        console.log('兔子API响应状态:', response.status);
        console.log('响应头:', response.headers.raw());

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API错误响应:', errorText);
            return res.status(response.status).json({
                error: {
                    message: `API请求失败: ${response.status}`,
                    details: errorText
                }
            });
        }

        // 设置SSE响应头
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no' // 禁用Nginx缓冲
        });

        // 流式转发响应
        let buffer = '';
        
        response.body.on('data', (chunk) => {
            const text = chunk.toString();
            buffer += text;
            
            // 处理可能的多行数据
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // 保留最后一个不完整的行
            
            for (const line of lines) {
                if (line.trim()) {
                    // 直接转发SSE数据
                    res.write(line + '\n');
                    
                    // 日志记录（可选）
                    if (line.startsWith('data: ')) {
                        const data = line.substring(6);
                        if (data !== '[DONE]') {
                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.choices?.[0]?.delta?.content) {
                                    process.stdout.write(parsed.choices[0].delta.content);
                                }
                            } catch (e) {
                                // 忽略解析错误
                            }
                        }
                    }
                }
            }
        });

        response.body.on('end', () => {
            // 处理剩余的数据
            if (buffer.trim()) {
                res.write(buffer + '\n');
            }
            console.log('\n流式响应完成');
            res.write('data: [DONE]\n\n');
            res.end();
        });

        response.body.on('error', (error) => {
            console.error('流读取错误:', error);
            res.write(`data: {"error": "${error.message}"}\n\n`);
            res.end();
        });

    } catch (error) {
        console.error('代理服务器错误:', error);
        
        // 如果还没有发送响应头，返回JSON错误
        if (!res.headersSent) {
            res.status(500).json({
                error: {
                    message: '代理服务器内部错误',
                    details: error.message
                }
            });
        } else {
            // 如果已经开始流式响应，发送错误事件
            res.write(`data: {"error": "${error.message}"}\n\n`);
            res.end();
        }
    }
});

// 健康检查端点
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        api_key_configured: !!API_KEY,
        mode: 'streaming'
    });
});

app.listen(PORT, '127.0.0.1', () => {
    console.log(`流式代理服务器启动在 http://127.0.0.1:${PORT}`);
    console.log(`健康检查: http://127.0.0.1:${PORT}/health`);
    console.log(`API代理端点: http://127.0.0.1:${PORT}/api/chat/completions`);
    console.log('模式: 流式响应 (SSE)');
});
