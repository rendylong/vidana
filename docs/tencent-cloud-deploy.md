# 腾讯云 Lighthouse/CVM 部署

Vidana 可以在一台腾讯云 Lighthouse/CVM 上用 Node + PM2 + Nginx 运行。生产入口是 `npm run start:server`，它会用 Express 托管 `dist` 前端和现有 `/api/*` 接口。

## 服务器准备

以 Ubuntu 22.04/24.04 为例：

```bash
sudo apt update
sudo apt install -y git nginx

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

sudo npm install -g pm2
```

在腾讯云 Lighthouse/CVM 防火墙或安全组开放：

- TCP 80：Web 访问。
- TCP 22：SSH，仅保留可信来源。

## 应用发布

```bash
sudo mkdir -p /opt/vidana
sudo chown "$USER":"$USER" /opt/vidana
git clone <your-repo-url> /opt/vidana
cd /opt/vidana
npm ci
npm run build
```

创建 `/opt/vidana/.env.production`，不要提交到 Git：

```bash
VITE_APP_URL=http://<公网IP>
VIDANA_PUBLIC_ORIGIN=http://<公网IP>
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
JWT_SECRET=...
FEISHU_APP_ID=...
FEISHU_APP_SECRET=...
MIMO_API_KEY=...
MIMO_API_ENDPOINT=https://token-plan-cn.xiaomimimo.com/v1
```

启动服务：

```bash
pm2 start npm --name vidana -- run start:server
pm2 save
pm2 startup
```

默认服务监听 `127.0.0.1:5174`。如需覆盖：

```bash
PORT=5174 HOST=127.0.0.1 npm run start:server
```

## Nginx

创建 `/etc/nginx/sites-available/vidana`：

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 70m;

    location /api/analyze {
        proxy_pass http://127.0.0.1:5174;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 180s;
    }

    location /api/benchmark {
        proxy_pass http://127.0.0.1:5174;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 180s;
    }

    location /api/public/analyze {
        proxy_pass http://127.0.0.1:5174;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 180s;
    }

    location / {
        proxy_pass http://127.0.0.1:5174;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 180s;
    }
}
```

启用配置：

```bash
sudo ln -sf /etc/nginx/sites-available/vidana /etc/nginx/sites-enabled/vidana
sudo nginx -t
sudo systemctl reload nginx
```

## Supabase 和飞书

在 Supabase SQL Editor 应用 migrations：

- `supabase/migrations/001_init.sql`
- `supabase/migrations/002_api_keys.sql`
- `supabase/migrations/003_analysis_type.sql`

如果已经有表，只确认缺失 migration 已执行。执行后刷新 schema cache：

```sql
NOTIFY pgrst, 'reload schema';
```

飞书后台 OAuth 回调地址配置为：

```text
http://<公网IP>/api/auth/callback
```

如果飞书不接受公网 IP 或 HTTP 回调，改用临时域名或正式域名，并同步更新 `.env.production` 里的 `VITE_APP_URL` 和 `VIDANA_PUBLIC_ORIGIN`。

## 验证

```bash
curl -i http://<公网IP>/
curl -i http://<公网IP>/api/auth/me
pm2 logs vidana
sudo tail -f /var/log/nginx/error.log
```

浏览器访问 `http://<公网IP>/`，验证：

- 飞书登录。
- 上传视频并点击“点击分析”。
- 切到“视频对标”并生成报告。
- 历史记录可打开。
- API Key 页面可创建、重命名和删除 key。

CLI 验证：

```bash
export VIDANA_API_BASE_URL=http://<公网IP>
export VIDANA_API_KEY=vdn_...
node ./bin/vidana.mjs analyze ./sample.mp4 \
  --audience "二三线城市 30-50 岁男性" \
  --platform "抖音" \
  --context "新品首投，目标是提高表单转化"
```
