export const SECURITY_CONFIG = {
  maxPreviewLength: 240,
  maxPayloadLength: 12000,
  highFrequencyPerMinute: Number(process.env.SECURITY_HIGH_FREQUENCY_PER_MINUTE || 300),
  pathEnumerationPerMinute: Number(process.env.SECURITY_PATH_ENUMERATION_PER_MINUTE || 40),
  scanner404FiveMinutes: Number(process.env.SECURITY_404_FIVE_MINUTES || 20),
  loginFailFiveMinutes: Number(process.env.SECURITY_LOGIN_FAIL_FIVE_MINUTES || 8),
  ipAutoBanRiskScore: Number(process.env.SECURITY_IP_AUTO_BAN_RISK_SCORE || 80),
  blockEnabled: process.env.SECURITY_BLOCK_ENABLED !== 'false',
  // 决策阈值：threatScore >= blockThreshold 拦截，>= logThreshold 记录观察
  // (原先硬编码在 decisionEngine，提到这里便于按环境调整；默认值与原硬编码一致)
  blockThreshold: Number(process.env.SECURITY_BLOCK_THRESHOLD || 50),
  logThreshold: Number(process.env.SECURITY_LOG_THRESHOLD || 20),
  // 安全事件(攻击日志)保留天数，超期定时清理；0/负数 = 不清理。IP 信誉/封禁等状态数据不受影响
  eventRetentionDays: Number(process.env.SECURITY_EVENT_RETENTION_DAYS || 90),
};

export const SENSITIVE_KEYS = [
  /password/i,
  /^pwd$/i,
  /token/i,
  /authorization/i,
  /cookie/i,
  /^sid$/i,
  /secret/i,
  /credential/i,
];

export const SAFE_PREFIXES = ['/security'];

export const SENSITIVE_PATHS = [
  { pattern: /^\/?\.env/i, score: 55, name: '探测 .env 配置文件' },
  { pattern: /^\/?\.git(?:\/|$)/i, score: 55, name: '探测 Git 目录' },
  { pattern: /^\/?\.svn(?:\/|$)/i, score: 40, name: '探测 SVN 目录' },
  { pattern: /^\/?\.ds_store$/i, score: 30, name: '探测系统隐藏文件' },
  { pattern: /(?:^|\/)(wp-admin|wp-login\.php|xmlrpc\.php)(?:\/|$)/i, score: 40, name: '探测 WordPress 入口' },
  { pattern: /(?:^|\/)(phpmyadmin|pma|adminer)(?:\/|$)/i, score: 45, name: '探测数据库管理入口' },
  { pattern: /(?:^|\/)(backup|dump|db|database).*\.(zip|tar|gz|sql|bak)$/i, score: 50, name: '探测备份文件' },
  { pattern: /(?:^|\/)(server-status|actuator|swagger-ui|api-docs)(?:\/|$)/i, score: 35, name: '探测管理或文档端点' },
];

export const MALICIOUS_FILE_EXTENSIONS = /\.(php\d?|phtml|jsp|jspx|asp|aspx|ashx|sh|bash|cmd|bat|exe|dll|so)$/i;

export const SIGNATURE_RULES = [
  {
    code: 'SQL_BOOLEAN_COMMENT',
    name: 'SQL 布尔盲注或注释截断',
    attackType: 'SQL_INJECTION',
    severity: 'high',
    baseScore: 55,
    confidence: 88,
    regex: /(?:'|%27|")\s*(?:or|and)\s+(?:'?\d+'?\s*=\s*'?\d+'?|[a-z_][\w]*\s*=\s*[a-z_][\w]*)(?:\s*(?:--|#|\/\*))?/i,
    includedContexts: ['numeric', 'identifier', 'auth'],
  },
  {
    code: 'SQL_UNION_SELECT',
    name: 'SQL UNION SELECT 注入',
    attackType: 'SQL_INJECTION',
    severity: 'critical',
    baseScore: 82,
    confidence: 92,
    regex: /\bunion(?:\s+all)?\s+select\b/i,
    includedContexts: ['numeric', 'identifier', 'auth'],
  },
  {
    code: 'SQL_STACKED_QUERY',
    name: 'SQL 堆叠查询',
    attackType: 'SQL_INJECTION',
    severity: 'critical',
    baseScore: 86,
    confidence: 90,
    regex: /;\s*(?:drop|delete|insert|update|alter|truncate|create)\b/i,
    includedContexts: ['numeric', 'identifier', 'auth'],
  },
  {
    code: 'XSS_SCRIPT',
    name: 'XSS 脚本注入',
    attackType: 'XSS',
    severity: 'high',
    baseScore: 58,
    confidence: 86,
    // on... 从"任意字母"收窄为已知事件处理器白名单 + 左边界(空白/引号/斜杠/<)，
    // 避免 only=/online=/condition=/session= 这类正常参数误报为 XSS(仍命中 onerror=/onload=/<script> 等真实攻击)
    regex: /<\s*script\b|javascript\s*:|data\s*:\s*text\/html|<\s*iframe\b|(?:^|[\s"'`\/<])on(?:error|load|click|mouseover|mouseout|focus|blur|submit|change|input|keydown|keyup|keypress|abort|contextmenu|dblclick|drag|drop|scroll|wheel|copy|paste|cut|pointerdown|pointerup|touchstart|touchend)\s*=/i,
    excludedContexts: ['freeText'],
  },
  {
    code: 'COMMAND_INJECTION',
    name: '命令注入特征',
    attackType: 'COMMAND_INJECTION',
    severity: 'critical',
    baseScore: 88,
    confidence: 90,
    regex: /(?:;|\|\||&&|\$\(|`)\s*(?:rm|cat|curl|wget|bash|sh|nc|python|perl|ls|id|whoami|echo|env|hostname|ifconfig|netstat|ps|kill|chmod|chown|sudo|passwd|base64|awk|sed|grep|find|dd|mkfs)\b|\b(?:rm\s+-rf|wget\s+https?:|curl\s+https?:|spawn\(|exec\()\b/i,
    includedContexts: ['numeric', 'identifier', 'filename', 'unknown'],
  },
  {
    code: 'PATH_TRAVERSAL',
    name: '路径穿越',
    attackType: 'PATH_TRAVERSAL',
    severity: 'high',
    baseScore: 60,
    confidence: 88,
    regex: /(?:\.\.\/|\.\.\\|%2e%2e%2f|%252e%252e%252f|\/etc\/passwd|boot\.ini)/i,
    includedContexts: ['filename', 'unknown'],
  },
  {
    code: 'SSRF_PRIVATE_HOST',
    name: 'SSRF 内网地址访问',
    attackType: 'SSRF',
    severity: 'critical',
    baseScore: 82,
    confidence: 88,
    regex: /https?:\/\/(?:localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[0-1])\.)/i,
    includedContexts: ['url'],
    fieldPattern: /(?:callback|redirect|webhook|endpoint|target|fetch|proxy).*url$|^url$/i,
  },
  {
    code: 'CRLF_INJECTION',
    name: 'CRLF 注入',
    attackType: 'CRLF_INJECTION',
    severity: 'medium',
    baseScore: 35,
    confidence: 78,
    // 只作用于 url 上下文：CRLF 注入的攻击面是响应头/重定向 URL；body 字段里的换行是正常数据
    // (多行文本/JSON)，对其查裸 \r\n 是纯误报源。请求头 CRLF 注入由独立的 detectHeaderInjection 覆盖
    regex: /%0d%0a|%0d|%0a|\r\n|[\r\n]/i,
    includedContexts: ['url'],
  },
];

export const DETECTOR_RULES = [
  {
    code: 'SENSITIVE_PATH_PROBE',
    name: '敏感路径探测',
    attackType: 'SCANNER',
    severity: 'medium',
    baseScore: 55,
    confidence: 86,
    description: '按路径敏感程度计 30-55 分，高敏路径(.env/.git)直接拦截，重复探测叠加信誉分',
  },
  {
    code: 'MALICIOUS_FILE_UPLOAD',
    name: '恶意文件上传',
    attackType: 'MALICIOUS_FILE_UPLOAD',
    severity: 'critical',
    baseScore: 86,
    confidence: 88,
  },
  {
    code: 'NUMERIC_PARAM_ANOMALY',
    name: '数值参数异常',
    attackType: 'PAYLOAD_ANOMALY',
    severity: 'low',
    baseScore: 12,
    confidence: 68,
  },
  {
    code: 'HEADER_CRLF_INJECTION',
    name: '请求头 CRLF 注入',
    attackType: 'CRLF_INJECTION',
    severity: 'medium',
    baseScore: 35,
    confidence: 80,
  },
  {
    code: 'HIGH_FREQUENCY_REQUEST',
    name: '高频请求',
    attackType: 'FLOOD',
    severity: 'high',
    baseScore: 35,
    confidence: 78,
  },
  {
    code: 'API_ENUMERATION',
    name: '接口枚举',
    attackType: 'API_ENUMERATION',
    severity: 'medium',
    baseScore: 30,
    confidence: 76,
  },
  {
    code: 'SCANNER_404_PATTERN',
    name: '扫描器 404 模式',
    attackType: 'SCANNER',
    severity: 'medium',
    baseScore: 32,
    confidence: 82,
  },
  {
    code: 'BRUTE_FORCE',
    name: '暴力破解',
    attackType: 'BRUTE_FORCE',
    severity: 'high',
    baseScore: 42,
    confidence: 84,
  },
  {
    code: 'CREDENTIAL_STUFFING',
    name: '撞库或账号枚举',
    attackType: 'CREDENTIAL_STUFFING',
    severity: 'high',
    baseScore: 48,
    confidence: 84,
  },
  {
    code: 'PARAMETER_OVERFLOW',
    name: '参数溢出',
    attackType: 'PROTOCOL_ANOMALY',
    severity: 'medium',
    baseScore: 22,
    confidence: 80,
    description: '参数 key 或 value 长度超出合理范围，可能为 fuzzing 扫描',
  },
];

export const SECURITY_RULE_CATALOG = [...SIGNATURE_RULES, ...DETECTOR_RULES];
