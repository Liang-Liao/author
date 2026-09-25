# 🐳 Docker Deployment Guide

## Runtime and image verification

Source builds use Node 24 LTS, matching the CI major version. The Dockerfile pins
`node:24.20.0-alpine3.24` to the multi-platform index digest
`sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf`.
Review tag and digest updates together and repeat the image checks below. A pinned digest does not receive updates automatically.
Use `docker buildx imagetools inspect node:24-alpine` to discover updates, then verify the exact version tag.
See the [Node release schedule](https://nodejs.org/en/about/previous-releases) and
[Docker pinning guidance](https://docs.docker.com/build/building/best-practices/#pin-base-image-versions).

Docker dependency installation uses npm's `replace-registry-host` option to fetch npmmirror lockfile URLs
from the official npm registry, retaining locked versions and integrity checks without changing host npm settings.
See the [npm configuration reference](https://docs.npmjs.com/using-npm/config/#replace-registry-host).

```bash
docker build --tag author:smoke .
node scripts/docker-smoke.mjs author:smoke
```

The script checks the final image's Node runtime and standalone server: startup, non-root execution, writable data,
eight legal pages, PDF/DOC parsing, body limits, SSE completion and upstream disconnection on cancellation.
It separately checks public defaults and a trusted integration configuration with a synthetic desktop capability.
Both finite test containers use `--network none`, a read-only root filesystem and independent data volumes.
They mount no host directories, publish no ports and call no real AI providers.
Stopped test containers and synthetic volumes are retained for inspection; the script does not delete resources.
CI runs the image checks, and the publishing workflow pushes the same image only after they pass.

The runtime keeps `USER node` and a writable `/app/data` volume. Server file storage remains disabled by default.
Set `AUTHOR_ENABLE_FILE_STORAGE=true` only for trusted single-user deployments; use browser storage or authenticated cloud sync for public multi-user deployments.
See [API_RESOURCE_LIMITS.md](API_RESOURCE_LIMITS.md) for upload and ingress limits.

## Quick Start

### Option 1: Pull from Docker Hub (Recommended)

```bash
# 1. Create project directory
mkdir author && cd author

# 2. Create docker-compose.yml
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

# 3. Start
docker compose up -d

# 4. Visit http://localhost:3000
```

### Option 2: Build from Source

```bash
# 1. Clone the repository
git clone https://github.com/YuanShiJiLoong/author.git
cd author

# 2. Build and start
docker compose up -d --build

# 3. Visit http://localhost:3000
```

## Configure API Key

Two ways to configure:

### Option A: In-app Settings (Easiest)
After starting, configure your API Key directly in the app's ⚙️ Settings. No extra configuration needed.

### Option B: Environment Variables
```bash
# Copy the template
cp .env.example .env

# Edit .env with your Key
# Example for OpenAI:
#   API_KEY=your-key-here
#   API_BASE_URL=https://api.openai.com/v1
#   API_MODEL=gpt-4o

# Restart to apply
docker compose restart
```

## Custom Port

```bash
# Option 1: Modify port mapping in docker-compose.yml
ports:
  - "8080:3000"   # Change to 8080

# Option 2: Via environment variable
PORT=8080 docker compose up -d
```

## Updating

### Docker Hub Pull
```bash
docker compose down
docker compose pull
docker compose up -d
```

### Source Build
```bash
git pull
docker compose down
docker compose up -d --build
```

## Reverse Proxy (No Port Number + Auto HTTPS)

If you have a domain, use Caddy as a reverse proxy to access via `https://your-domain.com` without a port number:

```bash
# 1. Edit Caddyfile, replace author.example.com with your domain
nano Caddyfile

# 2. Start with the Caddy compose file
docker compose -f docker-compose.caddy.yml up -d

# 3. Visit https://your-domain (SSL certificate auto-provisioned)
```

> ⚠️ Make sure your domain points to the server IP and ports 80/443 are not in use.

## FAQ

### Q: Where is my data stored?
A: Data is stored in your browser's IndexedDB and localStorage, independent of the container. Clearing browser data will lose your content, but rebuilding the container will not.

### Q: Can I use it on mobile/tablet?
A: Yes. After deploying to a server, access `http://server-ip:3000` from any device's browser on the same network.

### Q: How do I connect a local model (Ollama, LM Studio, …)? What about "服务端默认禁止访问本机或内网地址" (loopback/LAN addresses blocked)?
A: The Docker build blocks loopback and LAN addresses by default. For a deployment only you or people you trust use, add `AUTHOR_ALLOW_PRIVATE_NETWORK=1` to `.env` and run `docker compose up -d`.

Two more things matter: inside the container, `localhost` points at the container itself, so use the LAN IP of the machine running the model; and the model server must be set to accept other devices. For full steps, every deployment layout, running the model on the NAS, and common errors, see the [Local Model Guide](LOCAL_MODELS_EN.md).

### Q: Does it support HTTPS?
A: Author does not include built-in HTTPS. Use a reverse proxy (Nginx, Caddy, or Traefik) in front to handle SSL certificates.

### Q: Does Docker Desktop work on Windows?
A: Yes, it supports Windows 10/11 with WSL2 or Hyper-V enabled. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) to get started.
