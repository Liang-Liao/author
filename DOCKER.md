# 🐳 Docker 部署指南

## 运行时与镜像验证

源码构建统一使用 Node 24 LTS，与 CI 的 Node 24 主版本保持一致。当前基础镜像为
`node:24.20.0-alpine3.24`，在 Dockerfile 中固定多架构索引摘要
`sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf`。
维护者应同时审查标签与摘要的更新，并重新运行下面的成品验证；固定摘要不会自动接收安全更新。
可用 `docker buildx imagetools inspect node:24-alpine` 查询官方新摘要，再核对精确版本标签。
参见 [Node 维护周期](https://nodejs.org/en/about/previous-releases) 和
[Docker 镜像固定建议](https://docs.docker.com/build/building/best-practices/#pin-base-image-versions)。

Docker 安装依赖时通过 npm 的 `replace-registry-host` 将锁文件中的 npmmirror 地址映射到 npm 官方源，
保留原有锁定版本和完整性校验，避免构建依赖地区镜像 CDN；不改动主机的 npm 配置。
相关选项见 [npm 配置文档](https://docs.npmjs.com/using-npm/config/#replace-registry-host)。

```bash
docker build --tag author:smoke .
node scripts/docker-smoke.mjs author:smoke
```

测试直接使用最终镜像的 Node 与 standalone 文件，检查启动、非 root 用户、数据目录写入、
八种法律页面、PDF/DOC 解析、请求体上限、SSE 完成及取消后的上游断开。
测试分为默认公网配置和带合成桌面访问凭据的本地集成配置；只有后者允许访问容器内部的模拟 AI 服务。
两个测试容器都使用 `--network none`、只读根文件系统及独立数据卷，不挂载主机目录、不公开端口、不调用真实模型。
脚本结束后保留已退出的测试容器和合成数据卷以便检查；脚本不执行删除或清理。
CI 增加成品镜像测试；发布流程只有通过该测试后才推送同一个已构建镜像。

镜像以 `node` 用户运行，`/app/data` 为可写持久化目录。文件存储默认关闭；
仅在受信任的单用户部署中设置 `AUTHOR_ENABLE_FILE_STORAGE=true` 才启用服务端文件存储。
多用户公网部署应使用浏览器存储或带认证的云同步。上传与入口配置见 [API_RESOURCE_LIMITS.md](API_RESOURCE_LIMITS.md)。

## 快速开始

### 方式一：Docker Hub 拉取（推荐）

```bash
# 1. 创建项目目录
mkdir author && cd author

# 2. 创建 docker-compose.yml
cat > docker-compose.yml << 'EOF'
services:
  author-app:
    image: yuanshijiloong/author:latest
    container_name: author-studio
    ports:
      - "3000:3000"
    env_file:
      - path: .env
        required: false
    restart: unless-stopped
EOF

# 3. 启动
docker compose up -d

# 4. 访问 http://localhost:3000
```

### 方式二：源码构建

```bash
# 1. 克隆仓库
git clone https://github.com/YuanShiJiLoong/author.git
cd author

# 2. 构建并启动
docker compose up -d --build

# 3. 访问 http://localhost:3000
```

## 配置 API Key

有两种方式配置：

### 方式 A：应用内配置（最简单）
启动后直接在应用内 ⚙️ 设置中填写 API Key，无需任何额外配置。

### 方式 B：环境变量配置
```bash
# 复制模板
cp .env.example .env

# 编辑 .env，填入你的 Key
# 例如使用智谱AI：
#   API_KEY=你的Key

# 重启生效
docker compose restart
```

## 自定义端口

```bash
# 方式1：修改 docker-compose.yml 中的端口映射
ports:
  - "8080:3000"   # 改为 8080

# 方式2：通过环境变量
PORT=8080 docker compose up -d
```

## 更新

### Docker Hub 拉取方式
```bash
docker compose down
docker compose pull
docker compose up -d
```

### 源码构建方式
```bash
git pull
docker compose down
docker compose up -d --build
```

## 反向代理（去掉端口号 + 自动 HTTPS）

如果你有域名，可以用 Caddy 反向代理，实现 `https://你的域名` 直接访问，不需要端口号：

```bash
# 1. 编辑 Caddyfile，将 author.example.com 替换为你的域名
nano Caddyfile

# 2. 使用带 Caddy 的 compose 文件启动
docker compose -f docker-compose.caddy.yml up -d

# 3. 访问 https://你的域名（自动签发 SSL 证书）
```

> ⚠️ 确保域名已解析到服务器 IP，且服务器 80/443 端口未被占用。

## 常见问题

### Q: 数据存储在哪里？
A: 数据存储在浏览器的 IndexedDB 和 localStorage 中，与容器无关。清除浏览器数据会丢失内容，重建容器不会。

### Q: 可以在手机/平板上使用吗？
A: 可以。部署到服务器后，在同一局域网内用手机浏览器访问 `http://服务器IP:3000` 即可。

### Q: 连本地模型（Ollama、LM Studio 等）提示"服务端默认禁止访问本机或内网地址"？
A: 为了防止公开实例被人借来探测内网，Docker 版默认不允许服务端连接本机或局域网地址。自己或信任的人使用的部署（例如放在 NAS 上）按下面三步设置。

**第一步：打开开关。** 在 `.env` 里加一行 `AUTHOR_ALLOW_PRIVATE_NETWORK=1`，然后执行 `docker compose up -d` 让它生效。

⚠️ 开启后，任何能打开这个 Author 页面的人都能让服务器去访问你的局域网。因此公开到外网的实例不要开启。

**第二步：让模型允许局域网连接。** Ollama 和 LM Studio 默认都只让本机连接。

| | Ollama | LM Studio |
|---|---|---|
| 默认端口 | 11434 | 1234 |
| 允许局域网连接 | 设置环境变量 `OLLAMA_HOST=0.0.0.0` 后重启 Ollama；用官方 Docker 镜像时已默认允许 | 桌面版：在 Developer 页的服务器设置里打开 "Serve on Local Network"；命令行：`lms server start --bind 0.0.0.0` |
| 模型名 | `ollama list` 里显示的名字，例如 `qwen3:8b` | LM Studio 里显示的模型标识；提示找不到模型时，先在 LM Studio 里把模型加载好 |
| API Key | 不需要，但 Author 里这一栏不能空着，随便填一个，例如 `ollama` | 没开 "Require Authentication" 时随便填一个；开了就填 LM Studio 生成的令牌 |

**第三步：在 Author 里填 API 地址。** 容器里的 `localhost` / `127.0.0.1` 指向容器自己，不能这样填。按模型跑在哪里来填：

| 模型跑在哪里 | API 地址填什么 |
|---|---|
| 局域网里的另一台电脑（LM Studio 最常见） | 那台电脑的局域网 IP，例如 `http://192.168.1.20:1234/v1`。电脑的防火墙要放行这个端口 |
| NAS 本机（直接安装，不在 Docker 里） | NAS 的局域网 IP，例如 `http://192.168.1.10:11434/v1` |
| NAS 上的 Docker，和 Author 写在同一个 compose 里 | 服务名，例如 `http://ollama:11434/v1`（见下一问） |

### Q: 能把模型也装在 NAS 上吗？
A: 能，推荐用 Ollama。它有官方 Docker 镜像，可以和 Author 写进同一个 compose。这样 Ollama 只在 compose 内部可见，不用对局域网开放端口：

```yaml
services:
  author-app:
    image: yuanshijiloong/author:latest
    container_name: author-studio
    ports:
      - "3000:3000"
    environment:
      - AUTHOR_ALLOW_PRIVATE_NETWORK=1
    restart: unless-stopped

  ollama:
    image: ollama/ollama
    volumes:
      - ollama:/root/.ollama
    restart: unless-stopped

volumes:
  ollama:
```

启动后下载模型：`docker compose exec ollama ollama pull qwen3:8b`。然后在 Author 里填 API 地址 `http://ollama:11434/v1`，模型名 `qwen3:8b`，API Key 随便填。

LM Studio 也有不带界面的服务器版（llmster），Linux 上能装，但官方没有 Docker 镜像，在群晖等 NAS 系统上安装比较麻烦，所以 NAS 上更推荐 Ollama。

另外，大多数 NAS 没有独立显卡，CPU 也偏弱，只适合跑几 B 参数的小模型，速度会明显比有显卡的电脑慢。如果家里有带显卡的电脑，把模型放在电脑上，让 NAS 上的 Author 去连，通常体验更好。

### Q: 支持 HTTPS 吗？
A: Author 本身不内置 HTTPS。建议在前面加一层反向代理（如 Nginx、Caddy 或 Traefik），由反向代理处理 SSL 证书。

### Q: Docker Desktop 支持 Windows 吗？
A: 支持 Windows 10/11，需要启用 WSL2 或 Hyper-V。安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/) 后即可使用。
