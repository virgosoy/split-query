# 02: 全文裸词搜索（AND/OR）

**What to build:** 多行搜索框；同一行词之间空格＝AND、不同行之间＝OR；普通词在整条目内子串包含、拉丁词大小写不敏感；空查询＝显示全部；结果保持导入文件顺序。query seam 是本票的测试边界。

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] query seam：裸词谓词按行解析（行内 AND、行间 OR）
- [ ] 子串包含匹配；拉丁词大小写不敏感
- [ ] 空查询＝显示全部、顺序不变
- [ ] query 参数化矩阵：AND / OR / 大小写 / 空查询
