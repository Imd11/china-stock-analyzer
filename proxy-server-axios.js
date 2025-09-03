const express = require('express');
const cors = require('cors');
const axios = require('axios');

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
        // 使用axios进行流式请求
        const response = await axios({
            method: 'POST',
            url: API_URL,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`,
                'Accept': 'text/event-stream',
                'User-Agent': 'Stock-Analyzer-Proxy/1.0'
            },
            data: requestBody,
            responseType: 'stream',
            timeout: 120000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        console.log('兔子API响应状态:', response.status);

        // 设置SSE响应头
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });

        // 处理流式数据
        let buffer = '';
        let messageCount = 0;
        
        response.data.on('data', (chunk) => {
            try {
                const text = chunk.toString();
                buffer += text;
                
                // 处理完整的数据行
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                    if (line.trim()) {
                        // 直接转发数据行
                        res.write(line + '\n');
                        
                        // 解析并记录进度（可选）
                        if (line.startsWith('data: ')) {
                            messageCount++;
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
                            } else {
                                console.log(`\n流式响应完成，共${messageCount}个消息块`);
                            }
                        }
                    }
                }
                
                // 立即刷新响应
                if (res.flush) res.flush();
                
            } catch (error) {
                console.error('处理数据块错误:', error);
            }
        });

        response.data.on('end', () => {
            // 处理剩余的缓冲数据
            if (buffer.trim()) {
                res.write(buffer + '\n');
            }
            
            // 确保发送结束标记
            if (!buffer.includes('[DONE]')) {
                res.write('data: [DONE]\n\n');
            }
            
            console.log('流式传输完成');
            res.end();
        });

        response.data.on('error', (error) => {
            console.error('流读取错误:', error);
            
            // 发送错误信息
            const errorData = {
                error: {
                    message: '流传输错误',
                    details: error.message
                }
            };
            res.write(`data: ${JSON.stringify(errorData)}\n\n`);
            res.end();
        });

    } catch (error) {
        console.error('代理服务器错误:', error.message);
        
        if (error.response) {
            console.error('错误响应状态:', error.response.status);
            console.error('错误响应数据:', error.response.data);
        }
        
        // 如果还没有发送响应头，返回JSON错误
        if (!res.headersSent) {
            res.status(500).json({
                error: {
                    message: '代理服务器内部错误',
                    details: error.message,
                    status: error.response?.status
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
        mode: 'streaming-axios'
    });
});

// 启动服务器
const server = app.listen(PORT, '127.0.0.1', () => {
    console.log(`Axios流式代理服务器启动在 http://127.0.0.1:${PORT}`);
    console.log(`健康检查: http://127.0.0.1:${PORT}/health`);
    console.log(`API代理端点: http://127.0.0.1:${PORT}/api/chat/completions`);
    console.log('模式: 流式响应 (SSE + Axios)');
});

// 增加服务器超时设置
server.timeout = 120000; // 2分钟
server.keepAliveTimeout = 120000;
server.headersTimeout = 121000;
