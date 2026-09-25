# 🖥️ Connecting Local Models (Ollama, LM Studio, …)

Local models run on your own computer or NAS. They cost nothing to use, and your text never leaves your network. Author can connect to any model server that offers an OpenAI-compatible API (the address usually ends with `/v1`).

> **Keep one thing in mind:** requests to the model are sent by **the machine running Author**, not by the browser you are using. Always fill in addresses from the point of view of the machine Author runs on. This is also true when you open Author from a phone or another computer.

## Contents

1. [Which case are you in](#which-case-are-you-in)
2. [Step 1: Allow LAN access (Docker / source deployments)](#step-1-allow-lan-access-docker--source-deployments)
3. [Step 2: Let the model server accept other devices](#step-2-let-the-model-server-accept-other-devices)
4. [Step 3: Configure Author](#step-3-configure-author)
5. [Running the model on the NAS too](#running-the-model-on-the-nas-too)
6. [Things to know about local models](#things-to-know-about-local-models)
7. [Optional: local embeddings for setting retrieval](#optional-local-embeddings-for-setting-retrieval)
8. [Troubleshooting by message](#troubleshooting-by-message)

## Which case are you in

| How you use Author | What to do |
|---|---|
| **Desktop app** (Windows installer), model on the same computer | Nothing to change. Use `http://127.0.0.1:PORT/v1` and skip to [Step 3](#step-3-configure-author) |
| **Desktop app**, model on another computer on your LAN | [Step 2](#step-2-let-the-model-server-accept-other-devices) and [Step 3](#step-3-configure-author) |
| **Docker** (on a NAS, PC or server) | All three steps |
| **Source deployment** (`npm run build` + `npm start`) | All three steps. If the model runs on the same machine, you can use `127.0.0.1` directly |
| **A web instance someone else runs** (including the official site) | That server will not connect to addresses on your home network. Use the desktop app or deploy your own instance |

## Step 1: Allow LAN access (Docker / source deployments)

To stop public instances from being used to probe internal networks, Docker and source deployments block loopback and LAN addresses by default and show "服务端默认禁止访问本机或内网地址" (the server blocks loopback/LAN addresses by default). For a deployment only you or people you trust use, turn it on as follows.

> ⚠️ Once enabled, anyone who can open this Author page can make it reach your LAN. Do not enable it on an instance reachable from the internet.

First update Author to the latest version, then set the environment variable `AUTHOR_ALLOW_PRIVATE_NETWORK=1` for your deployment:

| Deployment | How |
|---|---|
| docker compose | Add `AUTHOR_ALLOW_PRIVATE_NETWORK=1` to the `.env` file next to `docker-compose.yml`, then run `docker compose up -d`. `docker compose restart` alone does not pick up the new setting |
| docker run | Remove the old container and run it again with `-e AUTHOR_ALLOW_PRIVATE_NETWORK=1` |
| NAS web UI (Synology Container Manager, QNAP Container Station, …) | In the container's environment variables, add name `AUTHOR_ALLOW_PRIVATE_NETWORK` with value `1`, save, and restart the container |
| Source deployment | Add `AUTHOR_ALLOW_PRIVATE_NETWORK=1` to `.env.local` in the project folder, then restart |

**How to confirm it worked:** click **Test Connection** in Author again. As long as the message is no longer the one above, this step is done. Any other error means you are past this step, so continue with the next two.

## Step 2: Let the model server accept other devices

Model servers only accept connections from the same machine by default. Whenever Author and the model are on different machines, this step is required. **A Docker container counts as a separate machine**, so if Author runs in Docker you need this step even when the model is on the same NAS or PC.

### Ollama (default port 11434)

Set the environment variable `OLLAMA_HOST` to `0.0.0.0`, then restart Ollama:

| System | How |
|---|---|
| Windows | Quit Ollama from the taskbar. Search the Start menu for "Edit environment variables for your account", add `OLLAMA_HOST` with value `0.0.0.0`, then start Ollama again from the Start menu |
| macOS | Run `launchctl setenv OLLAMA_HOST "0.0.0.0"` in Terminal, then quit and reopen Ollama |
| Linux | Run `sudo systemctl edit ollama.service`, add `Environment="OLLAMA_HOST=0.0.0.0"` under `[Service]`, save, then run `sudo systemctl daemon-reload` and `sudo systemctl restart ollama` |
| Docker (official `ollama/ollama` image) | Already allowed, nothing to change |

### LM Studio (default port 1234)

- **Desktop app:** turn on **Serve on Local Network** in the server settings on the Developer page, and make sure the server is running.
- **CLI / headless edition:** start the server with `lms server start --bind 0.0.0.0`.
- If **Require Authentication** is on, you will enter the token LM Studio generated as the API Key in Author.

### Other OpenAI-compatible servers

| Software | Default port | Accept other devices |
|---|---|---|
| vLLM | 8000 | Add `--host 0.0.0.0` when starting |
| llama.cpp (llama-server) | 8080 | Add `--host 0.0.0.0` when starting |
| Xinference | 9997 | Add `-H 0.0.0.0` when starting |
| LocalAI | 8080 | Already allowed when run with Docker |
| Others | See their docs | Look for a "listen address / host / listen" setting and set it to `0.0.0.0` |

### Don't forget the firewall

- **Windows:** the first time the model server accepts LAN connections, Windows may show a firewall prompt. Choose "Allow". If you denied it earlier, allow the model server under "Allow an app through Windows Firewall".
- **macOS:** if the firewall is on, allow the model server under System Settings → Network → Firewall → Options.
- **NAS:** if the NAS firewall is on, open the model's port.

**How to confirm it worked:** from another device on the LAN, open `http://MODEL-MACHINE-IP:PORT/v1/models` in a browser, e.g. `http://192.168.1.20:11434/v1/models`. If you see text that includes model names, the model side is working.

## Step 3: Configure Author

Open ⚙️ (bottom-left) → **API Config**, choose **Custom compatible endpoint** as the provider, and fill in:

| Field | Value |
|---|---|
| API address | See the table below. It must end with `/v1`; do not append `/chat/completions` |
| API Key | Local models usually need none, but the field cannot be empty, so enter any placeholder such as `local`. If LM Studio has Require Authentication on, use its token |
| Model | Use **Fetch model list from API**, or type it: for Ollama, the name shown by `ollama list` (e.g. `qwen3:8b`); for LM Studio, the model identifier it shows |

Then click **Test Connection**.

### Filling in the API address

| Where Author runs | Where the model runs | API address |
|---|---|---|
| Desktop app or source deployment | Same computer | `http://127.0.0.1:PORT/v1` |
| Any | Another computer on the LAN | That computer's LAN IP, e.g. `http://192.168.1.20:1234/v1` |
| Docker (NAS or Linux server) | Same machine, installed directly (not in Docker) | This machine's LAN IP, e.g. `http://192.168.1.10:11434/v1`. Or add `extra_hosts: ["host.docker.internal:host-gateway"]` to Author in the compose file and use `http://host.docker.internal:11434/v1` |
| Docker Desktop (Windows / Mac) | Same computer, installed directly | `http://host.docker.internal:PORT/v1`. Docker Desktop provides this address out of the box |
| Docker | Another container on the same machine, in the same compose file | The service name, e.g. `http://ollama:11434/v1` (see [the next section](#running-the-model-on-the-nas-too)) |
| Docker | Another container on the same machine, run separately | This machine's LAN IP plus the published port. Or put both containers on the same Docker network and use the container name |
| Docker with host networking (often "use the same network as Docker Host" in NAS UIs) | Same machine | `http://127.0.0.1:PORT/v1`. The container shares the host's network, so the local address works |
| Any | Not on the same LAN (e.g. model at home, Author on a cloud server) | With Tailscale, ZeroTier or similar, use the model machine's IP on that network. With a tunnel or public address, use that address. Never expose a model API without password protection to the internet |

**Keep these in mind:**

- Inside a container, `localhost` and `127.0.0.1` mean the container itself, not your NAS or PC. Only use them where the table above says so.
- **Finding a LAN IP:** on Windows, run `ipconfig` and look for "IPv4 Address"; on macOS, see System Settings → Network; on a NAS, see its admin UI; or check the device list in your router.
- **Use a fixed IP:** LAN IPs can change after a reboot, which suddenly breaks the connection. Reserve a fixed IP for the model machine in your router (often called "DHCP reservation" or "IP & MAC binding").
- **Plain `http://` is fine on a LAN:** `https://` addresses with self-signed certificates will fail to connect.

## Running the model on the NAS too

Yes, and **Ollama** is the recommended choice. It has an official Docker image and can go in the same compose file as Author. Ollama is then only reachable inside the compose network, so no port has to be opened to the LAN:

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
    environment:
      # Optional: let the model take in more text; needs enough memory (see "Context length" below)
      - OLLAMA_CONTEXT_LENGTH=16384
    volumes:
      - ollama:/root/.ollama
    restart: unless-stopped

volumes:
  ollama:
```

After starting, download a model with `docker compose exec ollama ollama pull qwen3:8b`. In Author, set the API address to `http://ollama:11434/v1`, the model to `qwen3:8b`, and any placeholder API key.

**Can LM Studio run on a NAS?** LM Studio has a headless server edition (llmster) that installs on Linux, but there is no official Docker image. NAS systems such as Synology DSM are not standard Linux, so installing it is awkward. Ollama is the better fit for a NAS.

**Set your performance expectations:** most NAS devices have no dedicated GPU and a modest CPU. They can only run small models of a few billion parameters, noticeably slower than a PC with a GPU. If you have a PC with a GPU, running the model there and pointing the Author instance on the NAS at it usually works better. If your NAS has an NVIDIA GPU, see the Ollama documentation for enabling GPU acceleration in the container.

## Things to know about local models

### Context length (the most common pitfall)

Each request includes the settings, previous text and other references you selected, up to about 200k tokens by default. Local models usually accept far less. For example, Ollama defaults to 4k when there is less than 24 GB of VRAM. Anything beyond the limit is silently dropped by the model, so **the AI ignores your settings, forgets earlier text, or contradicts itself**, with no error shown.

Adjust both sides:

1. **Lower it in Author:** open the **Reference** tab in the AI panel on the right, and next to "Token Usage" set **Limit** to a number no larger than the model's context length, e.g. 8000 or 16000.
2. **Let the model accept more** (uses more RAM or VRAM):
   - Ollama: set `OLLAMA_CONTEXT_LENGTH` (e.g. `16384`) the same way as `OLLAMA_HOST` in [Step 2](#ollama-default-port-11434), then restart Ollama.
   - LM Studio: raise Context Length when loading the model; on the CLI, use `lms load MODEL --context-length 16384`.

### Generation time

As long as the model keeps producing output, a generation is never cut off, however long it takes. Only when the model produces nothing for 2 minutes straight do you see "Generation timed out and is incomplete. Please retry.", and the text written so far is kept.

The wait is longest **before the first word appears**: the model has to read everything sent to it before it starts writing, so more text and a slower machine mean a longer wait. If it often times out before any text appears (e.g. on a CPU-only NAS):

- Lower the limit in Author as described under [Context length](#context-length-the-most-common-pitfall), so the model has less to read.
- Switch to a smaller model.
- The first request has to load the model into memory and is slower. If it times out the first time, try again.

## Optional: local embeddings for setting retrieval

With many settings, Author can use an embedding model to pick the settings most relevant to what you are writing. This can run locally too:

1. Download an embedding model, e.g. `ollama pull nomic-embed-text` (in Docker: `docker compose exec ollama ollama pull nomic-embed-text`).
2. In **API Config**, turn on **Separate Embedding (Vector) API** and choose **Custom compatible endpoint** as the provider.
3. Set **Embedding API Address** to the same address as the chat model (e.g. `http://ollama:11434/v1`) and **Embedding Model Name** to `nomic-embed-text`.
4. Uncheck **Reuse chat API Key when blank** and leave the key empty.

## Troubleshooting by message

| Message | Cause | Fix |
|---|---|---|
| 服务端默认禁止访问本机或内网地址 (loopback/LAN addresses blocked) | [Step 1](#step-1-allow-lan-access-docker--source-deployments) has not taken effect | Check the variable name and that the value is `1`; make sure you recreated the container (`docker compose up -d`, not `restart`); make sure Author is up to date |
| Network connection failed. Please check that the API address is correct. | Author cannot reach the model | Check in order: the address is not a `localhost` that doesn't work inside a container; IP and port are correct; the model server is running and accepts other devices ([Step 2](#step-2-let-the-model-server-accept-other-devices)); the firewall allows it; the model address opens from another device (see the end of Step 2) |
| Please configure your API Key first. | API Key is empty | Enter any placeholder such as `local` |
| Please enter the OpenAI-compatible endpoint address | API address is empty | Fill it in as in [Step 3](#filling-in-the-api-address) |
| AI service returned an error (404) | The address is missing `/v1`, or has an extra path | Use the form `http://IP:PORT/v1` |
| AI service error: … model … not found | Wrong model name, or the model is not downloaded / loaded | Pick it again with **Fetch model list from API**; for Ollama run `ollama pull` first, for LM Studio load the model first |
| Could not fetch the model list | Wrong address, or no model is available yet | Check as for "Network connection failed"; make sure at least one model is downloaded |
| Context too long / Input is too long | The request exceeds the model's limit | See [Context length](#context-length-the-most-common-pitfall) |
| Generation timed out and is incomplete | The model produced nothing for 2 minutes, usually before the first word | See [Generation time](#generation-time) |
| Generation was interrupted and is incomplete | The model server dropped the connection, often from running out of memory or unloading the model | Check the model server's logs; use a smaller model or a shorter context length |
| Replies work, but the AI ignores settings or forgets earlier text | Input was silently cut off by the model | See [Context length](#context-length-the-most-common-pitfall) |
