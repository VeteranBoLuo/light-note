-- 把存量普通用户 admin 统一改名为 user(幂等,再次执行影响 0 行)
-- 由项目 owner 手动执行,不要自动跑
UPDATE `user` SET `role` = 'user' WHERE `role` = 'admin';
