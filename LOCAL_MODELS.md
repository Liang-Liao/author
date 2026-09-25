# 🖥️ 连接本地模型（Ollama、LM Studio 等）

本地模型是指跑在你自己的电脑或 NAS 上的大模型，不用付费，内容也不会发到外面。只要模型软件提供 OpenAI 兼容接口（地址一般以 `/v1` 结尾），Author 就能连接。

> **先记住一件事：** 连接模型的请求是由**运行 Author 的那台机器**发出的，不是由你正在使用的浏览器发出的。所以填地址时，要站在 Author 所在机器的角度来填。用手机或别的电脑打开 Author 也是一样。

## 目录

1. [你属于哪种情况](#你属于哪种情况)
2. [第一步：允许 Author 连接内网（Docker / 源码部署）](#第一步允许-author-连接内网docker--源码部署)
3. [第二步：让模型软件允许别的设备连接](#第二步让模型软件允许别的设备连接)
4. [第三步：在 Author 里填写](#第三步在-author-里填写)
5. [把模型也装在 NAS 上](#把模型也装在-nas-上)
6. [本地模型的使用注意](#本地模型的使用注意)
7. [可选：用本地模型做设定检索（向量）](#可选用本地模型做设定检索向量)
8. [按提示排查](#按提示排查)

## 你属于哪种情况

| 你怎么用 Author | 需要做什么 |
|---|---|
| **桌面版**（Windows 安装包），模型在同一台电脑 | 什么都不用改，地址直接填 `http://127.0.0.1:端口/v1`，跳到[第三步](#第三步在-author-里填写) |
| **桌面版**，模型在局域网里的另一台电脑 | 做[第二步](#第二步让模型软件允许别的设备连接)和[第三步](#第三步在-author-里填写) |
| **Docker 部署**（NAS、电脑、服务器都算） | 三步都要做 |
| **源码部署**（`npm run build` + `npm start`） | 三步都要做；模型在同一台机器时，地址可以直接填 `127.0.0.1` |
| **别人部署的网页版**（包括官网） | 对方的服务器不会替你连接你家里的地址。请改用桌面版，或者自己部署 |

## 第一步：允许 Author 连接内网（Docker / 源码部署）

为了防止公开的实例被人借来探测内网，Docker 和源码部署默认不允许 Author 连接本机或局域网地址，会提示"服务端默认禁止访问本机或内网地址"。自己或信任的人使用的部署，按下面的方式打开。

> ⚠️ 打开后，任何能打开这个 Author 页面的人都能让它去访问你的局域网。能从外网访问的实例不要打开。

请先把 Author 更新到最新版本，然后按你的部署方式设置环境变量 `AUTHOR_ALLOW_PRIVATE_NETWORK=1`：

| 部署方式 | 怎么设置 |
|---|---|
| docker compose | 在 `docker-compose.yml` 同目录的 `.env` 里加一行 `AUTHOR_ALLOW_PRIVATE_NETWORK=1`，然后执行 `docker compose up -d`。只执行 `docker compose restart` 不会读取新的设置 |
| docker run | 删掉旧容器，重新运行时加上 `-e AUTHOR_ALLOW_PRIVATE_NETWORK=1` |
| NAS 的图形界面（群晖 Container Manager、威联通 Container Station 等） | 在容器设置的"环境变量"里新增：变量名 `AUTHOR_ALLOW_PRIVATE_NETWORK`，值 `1`，保存后重启容器 |
| 源码部署 | 在项目目录的 `.env.local` 里加一行 `AUTHOR_ALLOW_PRIVATE_NETWORK=1`，然后重启 |

**怎么确认已经生效：** 回到 Author 再点一次"测试连接"。只要提示不再是"服务端默认禁止访问本机或内网地址"，这一步就成功了。即使出现别的错误，也说明已经过了这一关，接着看后面两步。

## 第二步：让模型软件允许别的设备连接

模型软件默认只允许本机连接。只要 Author 和模型不在同一台机器上，这一步就必须做。**Docker 容器也算另一台机器**，所以 Author 用 Docker 部署时，即使模型装在同一台 NAS 或电脑上，也要做这一步。

### Ollama（默认端口 11434）

把环境变量 `OLLAMA_HOST` 设为 `0.0.0.0`，然后重启 Ollama：

| 系统 | 做法 |
|---|---|
| Windows | 先在任务栏右下角退出 Ollama；在开始菜单搜索"编辑账户的环境变量"，新建变量 `OLLAMA_HOST`，值填 `0.0.0.0`；再从开始菜单重新打开 Ollama |
| macOS | 在终端执行 `launchctl setenv OLLAMA_HOST "0.0.0.0"`，然后退出并重新打开 Ollama |
| Linux | 执行 `sudo systemctl edit ollama.service`，在 `[Service]` 下加一行 `Environment="OLLAMA_HOST=0.0.0.0"`，保存后执行 `sudo systemctl daemon-reload` 和 `sudo systemctl restart ollama` |
| Docker（官方 `ollama/ollama` 镜像） | 已经默认允许，不用改 |

### LM Studio（默认端口 1234）

- **桌面版**：在 Developer 页面的服务器设置里打开 **Serve on Local Network**，并确认服务器已启动。
- **命令行 / 无界面服务器版**：用 `lms server start --bind 0.0.0.0` 启动。
- 如果打开了 **Require Authentication**，之后在 Author 里要把 LM Studio 生成的令牌填进 API Key。

### 其他兼容 OpenAI 接口的软件

| 软件 | 默认端口 | 允许别的设备连接 |
|---|---|---|
| vLLM | 8000 | 启动参数加 `--host 0.0.0.0` |
| llama.cpp（llama-server） | 8080 | 启动参数加 `--host 0.0.0.0` |
| Xinference | 9997 | 启动参数加 `-H 0.0.0.0` |
| LocalAI | 8080 | 用 Docker 运行时已默认允许 |
| 其他 | 见该软件文档 | 在设置里找"监听地址 / host / listen"，改成 `0.0.0.0` |

### 别忘了防火墙

- **Windows**：第一次允许局域网连接时，系统可能会弹出防火墙提示，选"允许"。如果之前点了拒绝，到"允许应用通过 Windows 防火墙"里把模型软件勾上。
- **macOS**：如果开了防火墙，在"系统设置 → 网络 → 防火墙 → 选项"里允许模型软件接收连接。
- **NAS**：如果开了 NAS 自带的防火墙，要放行模型使用的端口。

**怎么确认这一步成功了：** 在局域网里另一台设备的浏览器打开 `http://模型所在机器的IP:端口/v1/models`，例如 `http://192.168.1.20:11434/v1/models`。能看到一段包含模型名的文字，就说明模型那边没问题。

## 第三步：在 Author 里填写

打开左下角 ⚙️ → **API 配置**，服务商选 **自定义兼容端点**，然后填写：

| 项目 | 怎么填 |
|---|---|
| API 地址 | 见下表。结尾一定要带 `/v1`，不要再加 `/chat/completions` |
| API Key | 本地模型一般不需要，但这一栏不能空着，随便填一个，例如 `local`。LM Studio 打开了 Require Authentication 时，填它生成的令牌 |
| 模型名 | 点"从API拉取模型列表"选择，或者手动填：Ollama 填 `ollama list` 里显示的名字（例如 `qwen3:8b`），LM Studio 填它显示的模型标识 |

填好后点 **测试连接**。

### API 地址怎么填

| Author 在哪 | 模型在哪 | API 地址 |
|---|---|---|
| 桌面版或源码部署 | 同一台电脑 | `http://127.0.0.1:端口/v1` |
| 任何方式 | 局域网里的另一台电脑 | 那台电脑的局域网 IP，例如 `http://192.168.1.20:1234/v1` |
| Docker（NAS 或 Linux 服务器） | 同一台机器，直接安装（不在 Docker 里） | 这台机器的局域网 IP，例如 `http://192.168.1.10:11434/v1`；或者在 compose 里给 Author 加上 `extra_hosts: ["host.docker.internal:host-gateway"]`，然后填 `http://host.docker.internal:11434/v1` |
| Docker Desktop（Windows / Mac 电脑） | 同一台电脑，直接安装 | `http://host.docker.internal:端口/v1`，Docker Desktop 自带这个地址，不用额外设置 |
| Docker | 同一台机器的另一个容器，写在同一个 compose 里 | 服务名，例如 `http://ollama:11434/v1`（见[下一节](#把模型也装在-nas-上)） |
| Docker | 同一台机器的另一个容器，单独运行 | 这台机器的局域网 IP 加上映射出来的端口；或者把两个容器加入同一个 Docker 网络，然后用容器名 |
| Docker，网络模式设为 host（NAS 界面里常叫"使用与主机相同的网络"） | 同一台机器 | `http://127.0.0.1:端口/v1`，这时容器和主机共用网络，可以直接填本机地址 |
| 任何方式 | 不在同一个局域网（比如模型在家里，Author 在云服务器上） | 用 Tailscale、ZeroTier 等组网工具时，填模型那台机器在组网里的 IP；用内网穿透或公网地址时，直接填那个地址。不要把没有密码保护的模型接口直接暴露到公网 |

**注意这几点：**

- 容器里的 `localhost` 和 `127.0.0.1` 指的是容器自己，不是你的 NAS 或电脑。只有上表里写了可以用的情况才能这样填。
- **怎么查局域网 IP**：Windows 在命令提示符里运行 `ipconfig`，看"IPv4 地址"；macOS 在"系统设置 → 网络"里查看；NAS 在它的管理界面里查看；也可以到路由器后台的设备列表里找。
- **建议固定 IP**：局域网 IP 可能在重启后变化，导致突然连不上。可以在路由器里给模型所在的机器设置固定 IP（一般叫"DHCP 静态分配"或"IP 与 MAC 绑定"）。
- **局域网里用 `http://` 就行**：使用自签名证书的 `https://` 地址会连接失败。

## 把模型也装在 NAS 上

可以，推荐用 **Ollama**。它有官方 Docker 镜像，可以和 Author 写在同一个 compose 文件里。这样 Ollama 只在 compose 内部可见，不用对局域网开放端口：

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
      # 可选：调大模型能接收的内容长度，内存要足够（见下文"上下文长度"）
      - OLLAMA_CONTEXT_LENGTH=16384
    volumes:
      - ollama:/root/.ollama
    restart: unless-stopped

volumes:
  ollama:
```

启动后下载模型：`docker compose exec ollama ollama pull qwen3:8b`。然后在 Author 里填 API 地址 `http://ollama:11434/v1`，模型名 `qwen3:8b`，API Key 随便填一个。

**LM Studio 能装在 NAS 上吗？** LM Studio 有无界面的服务器版（llmster），可以装在 Linux 上，但没有官方 Docker 镜像。群晖等 NAS 系统不是标准 Linux，装起来比较麻烦，所以 NAS 上更推荐 Ollama。

**性能要有心理准备：** 大多数 NAS 没有独立显卡，CPU 也偏弱，只适合跑几 B 参数的小模型，速度会明显比有显卡的电脑慢。如果家里有带显卡的电脑，把模型装在电脑上，让 NAS 上的 Author 去连接，通常体验更好。NAS 装了 NVIDIA 显卡时，可以参考 Ollama 官方文档给容器开启显卡加速。

## 本地模型的使用注意

### 上下文长度（最容易踩的坑）

Author 每次会把勾选的设定、前文等参考内容一起发给模型，默认最多约 200k token。本地模型能接收的内容通常少得多，例如 Ollama 在显存小于 24GB 时默认只有 4k。超出的部分会被模型直接丢掉，表现为 **AI 不看设定、忘了前文、回答前后对不上**，而且不会有任何报错。

两边都要调：

1. **在 Author 里调小**：打开右侧 AI 面板的 **参考** 标签，在"Token 用量"旁边的 **上限** 里填一个不超过模型上下文长度的数，例如 8000 或 16000。
2. **让模型接收更多**（会占用更多内存或显存）：
   - Ollama：像[第二步](#ollama默认端口-11434)设置 `OLLAMA_HOST` 那样，再设置 `OLLAMA_CONTEXT_LENGTH`，例如 `16384`，然后重启 Ollama。
   - LM Studio：加载模型时调大 Context Length；命令行用 `lms load 模型名 --context-length 16384`。

### 生成时间

只要模型还在输出，写多久都不会被打断。模型连续 2 分钟没有任何输出时，才会提示"生成超时，内容尚未完成，请重试。"，已经写出的内容会保留。

最容易超时的是**开始输出之前**那段时间：模型要先读完发给它的全部内容才会开始写，内容越多、机器越慢，等得越久。如果经常在一个字都没出来时就超时（例如只用 CPU 的 NAS）：

- 按[上下文长度](#上下文长度最容易踩的坑)的方法调小 Author 里的上限，让模型要读的内容少一些；
- 换一个更小的模型；
- 第一次请求要先把模型读进内存，会比较慢；如果第一次超时，再试一次。

## 可选：用本地模型做设定检索（向量）

设定很多时，Author 可以用向量模型挑出和当前内容最相关的设定。这一步也可以用本地模型：

1. 下载向量模型，例如 Ollama 执行 `ollama pull nomic-embed-text`（Docker 里执行 `docker compose exec ollama ollama pull nomic-embed-text`）。
2. 在 **API 配置** 里打开 **独立配置 Embedding (向量) API**，服务商选 **自定义兼容端点**。
3. **Embedding API 地址** 填和对话模型一样的地址（例如 `http://ollama:11434/v1`），**Embedding 模型名称** 填 `nomic-embed-text`。
4. 取消勾选 **留空时复用对话 API Key**，Key 留空即可。

## 按提示排查

| 看到的提示 | 原因 | 怎么办 |
|---|---|---|
| 服务端默认禁止访问本机或内网地址 | [第一步](#第一步允许-author-连接内网docker--源码部署)的设置没生效 | 检查变量名拼写，值是否为 `1`；改完是否重建了容器（`docker compose up -d`，不是 `restart`）；Author 是否已更新到最新版本 |
| 网络连接失败，请检查 API 地址是否正确 | Author 连不上模型 | 按顺序检查：地址是不是填了容器里不能用的 `localhost`；IP 和端口对不对；模型软件是否已启动、是否允许别的设备连接（[第二步](#第二步让模型软件允许别的设备连接)）；防火墙是否放行；用第二步末尾的方法，确认从别的设备能打开模型地址 |
| 请先配置 API Key | API Key 留空了 | 随便填一个，例如 `local` |
| 请先填写 OpenAI 兼容端点地址 | API 地址留空了 | 按[第三步](#api-地址怎么填)填写 |
| AI 服务返回错误 (404) | 地址结尾少了 `/v1`，或者多加了路径 | 地址改成 `http://IP:端口/v1` 这种形式 |
| AI 服务错误：……model …… not found | 模型名不对，或者模型还没下载 / 没加载 | 点"从API拉取模型列表"重新选择；Ollama 先 `ollama pull`，LM Studio 先加载模型 |
| 未能获取到模型列表 | 地址不对，或者模型软件还没有可用的模型 | 先按"网络连接失败"那一行检查；确认模型软件里至少有一个已下载的模型 |
| 上下文过长 / 输入内容过长 | 发送的内容超过了模型的上限 | 见[上下文长度](#上下文长度最容易踩的坑) |
| 生成超时，内容尚未完成 | 模型连续 2 分钟没有任何输出，常见于开始输出之前 | 见[生成时间](#生成时间) |
| 生成中断，内容未完成 | 模型软件中途断开，常见原因是内存不足，或者模型被自动卸载 | 看模型软件的日志；换小模型或调小上下文长度 |
| 能生成，但 AI 不看设定、忘了前文 | 内容被模型悄悄截断了 | 见[上下文长度](#上下文长度最容易踩的坑) |
