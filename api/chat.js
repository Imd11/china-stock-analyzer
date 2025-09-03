export const config = {
  runtime: 'nodejs',
  maxDuration: 300, // 5分钟超时
};

export default async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 处理CORS预检
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  try {
    const body = req.body;

    const response = await fetch('https://api.tu-zi.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-DqlYesMKwBBmKYcGn0ZSYwGvh2lO7YdYm2lmUpblm8kGjxXp'
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      res.status(response.status).json({
        error: `API Error: ${response.status}`,
        details: errorText
      });
      return;
    }
    
    // 设置流式响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁用Nginx缓冲
    
    // 设置心跳保持连接
    const heartbeat = setInterval(() => {
      res.write(':heartbeat\n\n');
    }, 30000); // 每30秒发送心跳
    
    // 手动处理流式响应
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          clearInterval(heartbeat);
          res.write('data: [DONE]\n\n');
          res.end();
          break;
        }
        
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
        
        // 强制刷新缓冲区
        if (res.flush) res.flush();
      }
    } catch (streamError) {
      console.error('Stream error:', streamError);
      clearInterval(heartbeat);
      res.end();
    }
    
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}
