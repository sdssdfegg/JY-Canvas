#!/usr/bin/env bash
# ============================================================================
# tt-image-2.5 渠道独立计费 · 服务端落地脚本（LY=p14 / LK=p12 / 其余=默认0.10）
# 适用范围：154.9.255.54 上的 New API（进程 new-api-custom，库 /opt/new-api/data/one-api.db）
# 依赖：sqlite3（系统自带或 apt install sqlite3）
# 用法：sudo bash tt25-independent-pricing-apply.sh
#
# ⚠️ 本脚本【未经本地测试】（编写环境无法 SSH 到 154），仅按执行单 §5.1 编写。
#    落地前请在 154 上先 dry-run（把实际写操作注释掉、只跑只读核对），确认 Schema 一致。
# ⚠️ 红线：① 先备份 one-api.db；② 保留旧名 tt-image-2.5=0.10 作为默认档（不动存量客户）；
#        ③ 只动 channel_id=8；④ 改完重启 new-api-custom。
# ============================================================================

set -euo pipefail

DB="/opt/new-api/data/one-api.db"
BAK="${DB}.bak-$(date +%Y%m%d-%H%M%S)-tt25-pricing"
API="https://api.jingyin.online"

echo "==> [0] 备份数据库"
cp -p "$DB" "$BAK"
echo "    备份: $BAK"

SQL() { sqlite3 "$DB" "$@"; }

echo "==> [1] 核对 Schema（自动探测列名，避免写错）"
# options 表：确认 ModelPrice 这一行存在
OPT_EXISTS=$(SQL "SELECT count(*) FROM options WHERE key='ModelPrice';" 2>/dev/null || echo "0")
echo "    options.ModelPrice 行数 = $OPT_EXISTS"
[ "$OPT_EXISTS" -ge 1 ] || { echo "❌ 未找到 options.ModelPrice，Schema 可能不同，停止！"; exit 1; }

# abilities 表：确认列
ABIL_COLS=$(SQL "PRAGMA table_info(abilities);" | cut -d'|' -f2 | tr '\n' ',' )
echo "    abilities 列 = $ABIL_COLS"

# channels 表：确认 channel_id=8 存在且有 model_mapping 列
CH8_EXISTS=$(SQL "SELECT count(*) FROM channels WHERE id=8;" 2>/dev/null || echo "0")
echo "    channels.id=8 行数 = $CH8_EXISTS"
[ "$CH8_EXISTS" -ge 1 ] || { echo "❌ 未找到 channels.id=8，停止！"; exit 1; }

echo "==> [2] 读取现有 ModelPrice（核对基线，不改默认档）"
SQL "SELECT value FROM options WHERE key='ModelPrice';"

echo "==> [3] 追加 3 个价格档键（幂等：已有则跳过）"
# 用 Python 做安全的 JSON 合并，避免手拼 JSON 出错
python3 - <<'PY'
import sqlite3, json
db="/opt/new-api/data/one-api.db"
con=sqlite3.connect(db); cur=con.cursor()
row=cur.execute("SELECT value FROM options WHERE key='ModelPrice'").fetchone()
mp=json.loads(row[0]) if row else {}
add={"tt-image-2.5-p11":0.11,"tt-image-2.5-p12":0.12,"tt-image-2.5-p14":0.14}
changed=False
for k,v in add.items():
    if k in mp and abs(float(mp[k])-v)<1e-9:
        print(f"    跳过已存在: {k}={mp[k]}")
    else:
        mp[k]=v; changed=True; print(f"    新增/覆盖: {k}={v}")
if changed:
    cur.execute("UPDATE options SET value=? WHERE key='ModelPrice'", (json.dumps(mp,ensure_ascii=False),))
    con.commit(); print("    ModelPrice 已写入")
else:
    print("    ModelPrice 无需变更")
con.close()
PY

echo "==> [4] abilities 表插入 3 行（幂等：同 model+channel_id 已存在则跳过）"
# 字段照抄现有 tt-image-2.5 行，仅改 model
python3 - <<'PY'
import sqlite3
db="/opt/new-api/data/one-api.db"
con=sqlite3.connect(db); cur=con.cursor()
tmpl=cur.execute("SELECT \"group\",channel_id,enabled,priority,weight,tag FROM abilities WHERE model='tt-image-2.5' LIMIT 1").fetchone()
if not tmpl:
    print("❌ 找不到 tt-image-2.5 的 abilities 模板行，停止！"); raise SystemExit(1)
g,cid,en,pri,w,tag=tmpl
print(f"    模板: group={g} channel_id={cid} enabled={en} priority={pri} weight={w} tag={tag}")
news=["tt-image-2.5-p11","tt-image-2.5-p12","tt-image-2.5-p14"]
for m in news:
    ex=cur.execute("SELECT count(*) FROM abilities WHERE model=? AND channel_id=?",(m,cid)).fetchone()[0]
    if ex:
        print(f"    跳过已存在: {m} @channel_id={cid}")
    else:
        cur.execute('INSERT INTO abilities("group",model,channel_id,enabled,priority,weight,tag) VALUES(?,?,?,?,?,?,?)',
                    (g,m,cid,en,pri,w,tag))
        print(f"    插入: {m} @channel_id={cid}")
con.commit(); con.close()
PY

echo "==> [5] channel_id=8 设置 model_mapping（把新名映射回 tt-image-2.5，adapter 零改动）"
python3 - <<'PY'
import sqlite3, json
db="/opt/new-api/data/one-api.db"
con=sqlite3.connect(db); cur=con.cursor()
row=cur.execute("SELECT model_mapping FROM channels WHERE id=8").fetchone()
cur_mm=json.loads(row[0]) if row and row[0] else {}
new_mm={"tt-image-2.5-p11":"tt-image-2.5","tt-image-2.5-p12":"tt-image-2.5","tt-image-2.5-p14":"tt-image-2.5"}
merged={**cur_mm,**new_mm}
cur.execute("UPDATE channels SET model_mapping=? WHERE id=8",(json.dumps(merged,ensure_ascii=False),))
con.commit(); con.close()
print("    model_mapping 已设置:", json.dumps(merged,ensure_ascii=False))
PY

echo "==> [6] 重启 New API 使缓存生效"
systemctl restart new-api-custom
sleep 3
systemctl is-active --quiet new-api-custom && echo "    ✅ new-api-custom 运行中" || echo "    ❌ new-api-custom 未运行，请检查日志"

echo "==> [7] 验收（核心）：用测试令牌分别调 4 个模型名，核对额度扣减"
echo "    准备：登录拿 token + New-Api-User 头（user_id=1）"
echo "    对每个模型名各发 1 次生图请求，前后读 remain_quota 做差值："
echo "      tt-image-2.5      (Origin 等) → 期望扣 0.10"
echo "      tt-image-2.5-p11  (Subdirect) → 期望扣 0.11"
echo "      tt-image-2.5-p12  (LK-1K)     → 期望扣 0.12"
echo "      tt-image-2.5-p14  (LY满血版)  → 期望扣 0.14"
echo "    ⚠️ 若某个新名扣的仍是 0.10，说明 New API 按 model_mapping 后的名计费（方案需调整）——立即回滚见下方。"

echo "==> 回滚：cp -p $BAK $DB && systemctl restart new-api-custom"
