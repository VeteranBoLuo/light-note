let socket: WebSocket;
let reconnectAttempts = 0;

const connect = () => {

  // 建立 WebSocket 连接
  socket = new WebSocket('/ws');
  // 当连接打开时触发
  socket.onopen = () => {
    console.log('WebSocket Connected');
    reconnectAttempts = 0; // 重置重连尝试次数
  };

  // 当接收到消息时触发
  socket.onmessage = (event) => {
    console.log('Received Message:', event.data);
  };

  // 当连接关闭时触发
  socket.onclose = (event) => {
    console.log('WebSocket Connection Closed:', event);
    // 延迟重连
    const reconnectDelay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // 最大30秒
    setTimeout(() => {
      reconnectAttempts++;
      console.log(`尝试第${reconnectAttempts}次重新连接...`);
      connect();
    }, reconnectDelay);
  };

  // 当连接出错时触发
  socket.onerror = (error) => {
    console.error('WebSocket Error:', error);
  };
};

export { connect };
