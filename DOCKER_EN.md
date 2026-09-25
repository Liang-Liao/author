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

### Q: Local models (Ollama, LM Studio, …) fail with "服务端默认禁止访问本机或内网地址" (server blocks loopback/LAN addresses)?
A: To stop public instances from being used to probe internal networks, the Docker build blocks loopback and LAN addresses by default. For a deployment only you or people you trust use (e.g. on a NAS), follow these three steps.

**Step 1: turn on the switch.** Add `AUTHOR_ALLOW_PRIVATE_NETWORK=1` to `.env` and apply it with `docker compose up -d`.

⚠️ With this enabled, anyone who can open this Author page can make the server reach your LAN. Do not enable it on an instance exposed to the internet.

**Step 2: let the model server accept LAN connections.** Both Ollama and LM Studio only accept local connections by default.

| | Ollama | LM Studio |
|---|---|---|
| Default port | 11434 | 1234 |
| Allow LAN connections | Set `OLLAMA_HOST=0.0.0.0` and restart Ollama; the official Docker image already allows them | Desktop app: turn on "Serve on Local Network" in the server settings on the Developer page. CLI: `lms server start --bind 0.0.0.0` |
| Model name | The name shown by `ollama list`, e.g. `qwen3:8b` | The model identifier shown in LM Studio. If Author reports that the model is not found, load the model in LM Studio first |
| API Key | Not needed, but the field in Author cannot be empty, so enter any placeholder such as `ollama` | Any placeholder unless "Require Authentication" is on; if it is, use the token LM Studio generated |

**Step 3: enter the API address in Author.** Inside the container, `localhost` / `127.0.0.1` point at the container itself, so do not use them. Choose based on where the model runs:

| Where the model runs | API address |
|---|---|
| Another computer on the LAN (typical for LM Studio) | That computer's LAN IP, e.g. `http://192.168.1.20:1234/v1`. Its firewall must allow that port |
| Directly on the NAS (not in Docker) | The NAS's LAN IP, e.g. `http://192.168.1.10:11434/v1` |
| In Docker on the NAS, in the same compose file as Author | The service name, e.g. `http://ollama:11434/v1` (see the next question) |

### Q: Can the model also run on the NAS?
A: Yes, and Ollama is the recommended choice there. It has an official Docker image and can go in the same compose file as Author. Ollama is then only reachable inside the compose network, so no port has to be opened to the LAN:

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

After starting, download a model with `docker compose exec ollama ollama pull qwen3:8b`. In Author, set the API address to `http://ollama:11434/v1`, the model to `qwen3:8b`, and any placeholder API key.

LM Studio also has a headless server edition (llmster) that installs on Linux. It has no official Docker image, though, and is awkward to install on NAS systems such as Synology DSM, so Ollama is the better fit for a NAS.

Also note that most NAS devices have no dedicated GPU and a modest CPU. They can only run small models of a few billion parameters, noticeably slower than a PC with a GPU. If you have a PC with a GPU, running the model there and pointing the Author instance on the NAS at it usually works better.

### Q: Does it support HTTPS?
A: Author does not include built-in HTTPS. Use a reverse proxy (Nginx, Caddy, or Traefik) in front to handle SSL certificates.

### Q: Does Docker Desktop work on Windows?
A: Yes, it supports Windows 10/11 with WSL2 or Hyper-V enabled. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) to get started.
