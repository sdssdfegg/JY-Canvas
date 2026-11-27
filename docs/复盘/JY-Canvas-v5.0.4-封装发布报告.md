# JY-Canvas v5.0.4 封装发布报告

> 日期：2026-11-27　性质：新版本封装（SD 新增 artsa 默认 + 香蕉2.1 Origin + 异常日志补全）。源码 HEAD `adc916e`（用户已自行推送 origin/main）。

## 一、版本与产物
| 项 | 值 |
|---|---|
| 产品版本 | v5.0.4（`build.config.json` 5.0.3→5.0.4；minUpdatableVersion 保持 v5.0.0） |
| 内部版本 | 11.0.1 |
| 源码 HEAD | `adc916e`（含 artsa 渠道/默认/排序、香蕉2.1 Origin、异常日志；用户已于 14:30 推送到 origin/main） |
| exe SHA256 | `B99D8F9A26548E6A29D123FEA46D1C09D6D18D7C449458B97E9116E5A1953C99`（99,541,504 B / 94.9 MB） |
| 种子 | 9 entry，seedId `aaa7dd40`，SHA256 `2B555F7F…14C6`（39,962 B），封装前设置页重新同步 |
| 发布包 | `D:\源码开发\静音AI画板v4.0-发布工程\releases\v5.0.4\静音AI画板v5.0.4\`（19 文件 / 95.1 MB） |
| 补丁包 | `patch-from-v5.0.3`（5 变化文件 / 94.9 MB） |
| 归档 | `D:\源码开发\静音AI画板二进制版本\v5.0.4\`（exe 哈希一致） |

## 二、本次客户视角改动
1. SD 模型新增 artsa 线路（¥0.11），默认选中且排在渠道列表第一位。
2. 纳米香蕉2.1 新增 Origin 线路（¥0.14）。
3. 既有线路与价格不变，v5.0.3/5.0.2 能力全部保留。

## 三、验证
| 验证 | 结果 |
|---|---|
| ① 构建 | ✅ EXIT=0，19 文件 / 95.1 MB，补丁 5 变化文件 |
| ② public 首启动冒烟 | ✅ health 200 `ok:true` uptimeSec 2、`#root` 71643 字符非白屏、7 视图零错误、console/pageerror 零错误 |
| ③ 校验安装 | ✅ `verify-local.mjs v5.0.4` 19/19 一致、清单外 0 |
| ③ 四红线 | ✅ 无凭据/无生图记录/9 entry 随包/无用户态数据；release-seed-check ok:true |
| ④ 更新演练 | — 待 Owner 实机 |
| 门禁 | 全量 88 项 87 通过（唯一失败 seed 冻结哈希=发版配套同步）；routing-check 211/211；size 未刷基线；build EXIT=0 |
| 渠道 UI | 源码 dev 实测：SD 下拉 artsa→HS、默认 artsa；香蕉2.1 含 Origin ¥0.14（public 包用同一份产物/配置） |

## 四、收尾
- 构建写入的 `dist/.release-mode` 已删（恢复源码 dev 正常态）；**发布包与归档的 exe 旁标记均完好**（这次未误删）。
- 种子未提交（用户本地种子态，仅随包内嵌）；冒烟临时文件已清理。
- 用户已于封装前自行推送 `adc916e` 到 origin/main（`fd21dba..adc916e main -> main`）。
