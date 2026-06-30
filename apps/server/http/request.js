import https from 'https';

const request = {
  requestData(method, url, options = {}) {
    return new Promise((resolve, reject) => {
      const reqOptions = {
        ...options,
        method: method,
        rejectUnauthorized: false, // 允许自签名证书
      };

      const req = https.request(url, reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            // 尝试将响应数据解析为JSON对象
            const jsonData = JSON.parse(data);
            resolve({
              status: res.statusCode,
              headers: res.headers,
              data: jsonData, // 使用解析后的JSON对象
            });
          } catch (error) {
            // 如果解析失败，可能是服务器没有返回JSON格式数据
            resolve({
              status: res.statusCode,
              headers: res.headers,
              data: data, // 返回原始字符串数据
            });
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (method === 'POST' && options.body) {
        req.write(JSON.stringify(options.body));
      }

      req.end();
    });
  },

  get(url, options) {
    return this.requestData('GET', url, options);
  },

  post(url, options) {
    return this.requestData('POST', url, options);
  },
};

export default request;
