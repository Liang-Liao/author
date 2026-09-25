## v1.2.58 — 支持连接局域网本地模型，改进同步与长时间生成

### 中文

#### 桌面端与网页版

- Docker 与源码部署新增 `AUTHOR_ALLOW_PRIVATE_NETWORK` 开关。自己或信任的人使用的部署（例如放在 NAS 上）开启后，可以连接本机或局域网里的本地模型（Ollama、LM Studio 等）和 WebDAV。默认仍然关闭；能从外网访问的实例请不要开启。
- 新增本地模型连接指南（`LOCAL_MODELS.md`），涵盖不同部署方式、模型软件设置、地址填写和常见报错；帮助页和各语言 README 已加入入口。
- 生成超时改为按"模型多久没有输出"计算。只要模型还在输出，就不会在 2 分钟时被中途切断，输出较慢的模型也能写完长内容。
- 改进同步：手机浏览器切到后台时会立即上传未同步的修改，关闭页面后下次打开会继续上传；内容较多时按大小分批上传，不再整批失败。
- 修复从 WebDAV、局域网或快照恢复后，部分设定一直无法同步到云端的问题。
- 同步失败时按原因给出提示（认证失败、路径不存在、内容过大、连不上服务器等）；云端没有找到数据时，不再显示为拉取成功。
- 升级前没有上传成功的修改不会被自动补传，请在升级后手动点一次"同步到云端"（WebDAV 为"推送本机"）。
- 感谢 [@inliver233](https://github.com/inliver233) 报告多项安全问题并提供修复方案。

---

### English

#### Desktop and Web

- Added the `AUTHOR_ALLOW_PRIVATE_NETWORK` switch for Docker and source deployments. When enabled on a deployment only you or people you trust use (e.g. on a NAS), Author can connect to local models (Ollama, LM Studio, …) and WebDAV on the same machine or LAN. It stays off by default; do not enable it on an instance reachable from the internet.
- Added a local model guide (`LOCAL_MODELS_EN.md`) covering deployment layouts, model server settings, API addresses, and common errors, with links from the in-app help and every README.
- Generation timeouts now measure how long the model has been silent. As long as the model keeps producing output, a generation is no longer cut off at 2 minutes, so slower models can finish long passages.
- Improved sync: unsynced changes upload as soon as a mobile browser moves to the background, and continue on the next visit after the page is closed. Large content is uploaded in size-based batches instead of failing as a whole.
- Fixed some lore entries never syncing to the cloud after restoring from WebDAV, LAN, or a snapshot.
- Sync failures now explain the cause (authentication failed, path not found, content too large, server unreachable, …). A pull that finds no cloud data is no longer reported as a success.
- Changes that failed to upload before this update are not re-sent automatically. After updating, click "Sync to Cloud" once (for WebDAV, "Push Local").
- Thanks to [@inliver233](https://github.com/inliver233) for reporting several security issues and proposing fixes.
