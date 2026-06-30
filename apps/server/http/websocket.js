import http from 'http';
import WebSocket from 'ws';

// 创建 HTTP 服务器
const server = http.createServer();

// 创建 WebSocket 服务器
const wss = new WebSocket.Server({ server });

// 监听连接事件
wss.on('connection', (ws) => {
  console.log('Client connected');

  // 监听消息事件
  ws.on('message', (message) => {
    console.log(`Received: ${message}`);
    // 发送响应
    ws.send(`You said: ${message}`);
  });

  // 监听关闭事件
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// 监听 HTTP 服务器端口
server.listen(3000, () => {
  console.log('WSS server started on port 3000');
});

export default wss;
