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

// 创建自定义的HTTP/HTTPS代理，增加超时和连接管理
const httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 10,
    maxFreeSockets: 5,
    timeout: 60000, // 增加到60秒
    freeSocketTimeout: 30000,
    rejectUnauthorized: true
});

const httpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 10,
    maxFreeSockets: 5,
    timeout: 60000, // 增加到60秒
    freeSocketTimeout: 30000
});

// 重试函数 - 增加超时时间到60秒
async function retryFetch(url, options, maxRetries = 2, delay = 2000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`尝试第${attempt}次请求...`);
            const response = await fetch(url, {
                ...options,
                timeout: 60000, // 增加到60秒
                agent: url.startsWith('https:') ? httpsAgent : httpAgent
            });
            return response;
        } catch (error) {
            console.error(`第${attempt}次请求失败:`, error.message);
            if (attempt === maxRetries) {
                throw error;
            }
            console.log(`等待${delay}ms后重试...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 1.5; // 降低退避因子
        }
    }
}

// 代理API请求
app.post('/api/chat/completions', async (req, res) => {
    console.log('收到代理请求:', {
        model: req.body.model,
        messages: req.body.messages?.length || 0,
        timestamp: new Date().toISOString()
    });

    try {
        const response = await retryFetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`,
                'User-Agent': 'Stock-Analyzer-Proxy/1.0',
                'Connection': 'keep-alive'
            },
            body: JSON.stringify(req.body)
        });

        console.log('兔子API响应状态:', response.status);

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

        const data = await response.json();
        console.log('API响应成功, 返回数据长度:', JSON.stringify(data).length);
        
        res.json(data);

    } catch (error) {
        console.error('代理服务器错误:', error);
        res.status(500).json({
            error: {
                message: '代理服务器内部错误',
                details: error.message
            }
        });
    }
});

// 健康检查端点
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        api_key_configured: !!API_KEY
    });
});

app.listen(PORT, '127.0.0.1', () => {
    console.log(`代理服务器启动在 http://127.0.0.1:${PORT}`);
    console.log(`健康检查: http://127.0.0.1:${PORT}/health`);
    console.log(`API代理端点: http://127.0.0.1:${PORT}/api/chat/completions`);
});