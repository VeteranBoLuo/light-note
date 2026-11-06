// 单一偏移保留整套回环端口的相对关系；独立工作树不复用已有环境。
export function localTestPorts(env = process.env) {
  const raw = String(env.LIGHTNOTE_LOCAL_PORT_OFFSET ?? '0');
  if (!/^\d+$/.test(raw)) throw new Error('LOCAL_TEST_PORT_OFFSET_INVALID');
  const offset = Number(raw);
  if (!Number.isSafeInteger(offset) || offset > 20_000) throw new Error('LOCAL_TEST_PORT_OFFSET_INVALID');
  const ports = {
    mysql: 13306,
    redis: 16379,
    storage: 19002,
    favicon: 19003,
    mail: 18025,
    smtp: 11025,
    api: 19001,
    web: 15173,
  };
  for (const key of Object.keys(ports)) ports[key] += offset;
  return {
    ...ports,
    offset,
    storagePorts: [19333, 29333, 19340, 29340, 18888, 28888, 29002].map((port) => port + offset),
  };
}
