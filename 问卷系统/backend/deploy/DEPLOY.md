# AI 审美系统 · 云部署手册（中国香港 · 单站点）

本手册把 **AI 审美测评问卷系统（Node + node:sqlite）** 部署到一台 **中国香港**云服务器。
香港服务器 **无需 ICP 备案**，域名买好直接解析 + Caddy 自动签 HTTPS 即可上线。

> 本项目**零外部 npm 依赖**（仅用 Node 内置 + node:sqlite），云上**无需 npm install**，
> 只要有 Node >= 22 即可直接 `node server.js` 运行，比 Python ML 项目部署简单得多。

---

## 1. 选购服务器

| 项 | 推荐 |
|---|---|
| 地域 | 中国香港（免备案） |
| 镜像 | **系统镜像 · Ubuntu 22.04 / 24.04 LTS x64**（纯净系统，不要预装 WordPress/LNMP/宝塔/Docker） |
| 规格 | **2 核 2G 起**（SQLite + Node 轻量；预算够选 2核4G 更稳） |
| 磁盘 | 系统盘 20G+ SSD |
| 防火墙 | 控制台放行 `22`(SSH) / `80` / `443`；**不要**对外开 3000（只走内网反代） |

---

## 2. SSH 登录 + 装 Node 22 与 Caddy

```bash
ssh root@你的服务器IP

# 系统更新
apt update && apt -y upgrade

# 装 Node 22（node:sqlite 需要 >= 22.5）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # 必须 >= 22

# 装 Caddy（自动 HTTPS 反代）
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

---

## 3. 上传代码（在本机执行）

项目根约定：`/opt/apps/aesthetic/`（含 `index.html` 研究控制台 与 `问卷系统/` 子目录）。

```bash
# 传整个 问卷系统/ 目录（含 backend/ 与前端）
rsync -avz --exclude 'backups' --exclude 'logs' --exclude '.DS_Store' \
  /Users/hefeiyu/WorkBuddy/2026-08-04-12-23-07/问卷系统/ \
  root@你的服务器IP:/opt/apps/aesthetic/问卷系统/

# 传研究控制台首页（工作区根 index.html）
scp /Users/hefeiyu/WorkBuddy/2026-08-04-12-23-07/index.html \
  root@你的服务器IP:/opt/apps/aesthetic/index.html

# 传配置文件 .env（含 QQ邮箱 SMTP / 即梦图像 API 密钥，敏感，勿提交 git）
scp /Users/hefeiyu/WorkBuddy/2026-08-04-12-23-07/问卷系统/backend/.env \
  root@你的服务器IP:/opt/apps/aesthetic/问卷系统/backend/.env

# 可选：保留已有问卷数据（不传则全新起步）
scp /Users/hefeiyu/WorkBuddy/2026-08-04-12-23-07/问卷系统/backend/data.db \
  root@你的服务器IP:/opt/apps/aesthetic/问卷系统/backend/data.db
```

> 服务器上设置归属：`sudo chown -R www-data:www-data /opt/apps/aesthetic`
> 若服务器目录想用英文避免中文路径编码坑，把上面所有“问卷系统”改成你的英文名，
> 并同步修改 `deploy/aesthetic.service` 里的路径。

---

## 4. systemd 守护

```bash
sudo cp /opt/apps/aesthetic/问卷系统/backend/deploy/aesthetic.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now aesthetic
sudo systemctl status aesthetic        # 应 active(running)
journalctl -u aesthetic -n 50 --no-pager
curl http://127.0.0.1:3000/api/health # {"ok":true,"storage":"sqlite",...}
```

---

## 5. Caddy 单站点反代 + 自动 HTTPS

把 `deploy/Caddyfile` 内容写入 `/etc/caddy/Caddyfile`，改 `yourdomain.com` 为真实域名：

```bash
sudo cp /opt/apps/aesthetic/问卷系统/backend/deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile   # 改成你的域名
sudo systemctl restart caddy
sudo systemctl status caddy
```

---

## 6. 域名 DNS

域名控制台添加 **A 记录**：
```
yourdomain.com  A  ->  服务器公网IP
```
等 DNS 生效后，Caddy 自动申请证书。

---

## 7. 上线验证

- `https://yourdomain.com/` → 研究控制台首页
- `https://yourdomain.com/问卷系统/` 或对应入口 → 问卷页面
- `https://yourdomain.com/api/health` → `{"ok":true,...}`
- 注册/登录、问卷提交、邮箱验证码（QQ邮箱 SMTP 465）均可用

---

## 常见问题

- **Node 版本过低起不来**：`node -v` 必须 >= 22（node:sqlite 要求）。否则服务会直接报错退出。
- **收不到验证码 / 即梦出图失败**：二者都需**出站**网络。
  - QQ邮箱 SMTP 走 `465`（SSL），即梦图像 API 走 `443`；
  - 香港服务器默认放行出站，若失败检查云厂商安全组出站规则。
- **502 Bad Gateway**：后端没起或端口不对。检查 `systemctl status aesthetic` 与 Caddyfile 的 `reverse_proxy 127.0.0.1:3000`。
- **中文路径问题**：若 systemd 对“问卷系统”中文路径报错，把服务器目录改名（英文）并同步改 `aesthetic.service` 路径即可。
- **想换端口**：改 `aesthetic.service` 里的 `Environment=PORT=xxxx` 与 Caddyfile 的 `reverse_proxy` 端口，重启两者。
