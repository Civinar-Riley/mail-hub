# 临时邮箱渠道调研记录

> 整理时间：2026-10-27
> 测试环境：本机 Windows 10 / Node v26.12.1，也就是 Mail Hub 实际运行的环境
>
> 这份记录汇总了实测过的临时邮箱服务：**哪些接进来了、哪些接不进、每个卡在哪**。
> 目的是：下次想找新渠道时不用重复踩坑，也方便判断"是不是程序坏了"。
>
> **当前状态**：已接入 3 个（DuckMail、InboxKitten、MTempMail），其余因技术限制无法接入。
> InboxKitten 一节记录了一次判断错误与更正过程，值得一读。

---

## 已接入的渠道

| 渠道 | 状态 | 实测结论 |
|------|------|---------|
| **DuckMail** | ✅ 完整可用 | 8/8 建箱成功，真实验证码提取通过 |
| **InboxKitten** | ✅ 可用（正文受限） | 完整链路通过；验证码在标题里才能提取 |
| **MTempMail** | ⚠️ 部分可用 | 建箱正常，但 `fraudfindez.com` 域收不到信 |

详细实测过程见下文对应小节。

---

## 先说清楚"为什么不能当渠道"

Mail Hub 的自定义渠道（TemplateProvider）不是万能的抓取器，它有一套明确的约束。
一个服务要能接进来，必须同时满足下面这些：

| 要求 | 说明 | 不满足会怎样 |
|------|------|-------------|
| **接口返回 JSON** | 代码用 `JSON.parse()` 解析响应，再按 `a.b.c` 路径取字段 | 返回 HTML 就读不了，整个解析失败 |
| **Node 能连上** | Mail Hub 是 Node 程序，用 Node 的 `fetch` 发请求 | 被 Cloudflare 按 TLS 指纹拦截的直接 403 |
| **能建箱** 或 **地址即用** | 要么有创建接口，要么任意地址直接可用 | 两者都没有就无法分配地址 |
| **正文能取到原文** | 提取验证码要读邮件的 `text` / `html` 字段 | 只有摘要没正文，提不出验证码 |
| **参数能拼进 URL** | 详情接口的 URL 只能用 `{{messageId}}` 等有限变量 | 需要额外参数（如 region）就拿不到 |
| **无需交互式认证** | 只能配静态 Header / Query / Bearer | 要浏览器登录、要 OAuth、要过 JS 挑战的都不行 |

下面每个服务都标注了**具体卡在哪一条**。

---

## 一、InboxKitten —— 曾经判断接不进，后来推翻了

> ⚠️ **重要更正**：本文初版曾把 InboxKitten 列为"接不进来"，理由是需要 `region` 参数且正文返回 HTML。
> **这个判断是错的**，已在 2026-10-27 复测后推翻，并已作为内置渠道加入代码（`builtin-templates.ts` 的 `inboxkitten`）。
>
> 错在哪：我以为取正文必须调 `/getHtml`（那条确实要 region 且返回 HTML）。
> 但实际上 **列表接口 `/list` 的返回里就带着 `message.headers.subject`**，
> 验证码如果在标题里，直接用 `fromList` 模式就能提取，根本不需要碰正文接口。
>
> 保留这一节是因为"怎么错的"本身有价值——**判断一个渠道能不能接，不能只看正文接口，要先看列表里有什么。**

**地址**：https://inboxkitten.com
**性质**：开源临时邮箱，底层是 Mailgun，任何 `xxx@inboxkitten.com` 都能收信

### 实测：确实能收信（已用真实邮件验证）

我用 SMTP 直接向它的 MX 投递了一封测试邮件，投递成功，并且能在它的 API 里读到：

```
投递目标：obiqxmdiwk@inboxkitten.com
投递结果：成功（mxa.mailgun.org）

列表接口：GET /api/v1/mail/list?recipient=obiqxmdiwk
返回 1 封邮件：
  message.headers.from    = noreply@github.com
  message.headers.subject = Your verification code is 483921
```

另外它的公共箱 `demo@inboxkitten.com` 里长期有大量真实邮件（订阅号推广等）。实测时读到 **33 封**，
分布在两个 Mailgun 区域（`us-east4` 14 封、`us-west1` 19 封）。

> 📝 这个数字会随时间变化，因为它是个公开箱，不断有新邮件进来。

### 接入后的实际表现（Mail Hub 内实测）

作为内置渠道接入后，用真实邮件跑完整链路：

```
1) 建箱 POST /api/inbox {"for":"github.com","provider":"inboxkitten"}
   → 201 {"address":"obiqxmdiwk@inboxkitten.com", ...}

2) SMTP 投递 "Your verification code is 483921" 到该地址
   → 投递成功

3) GET /api/inbox/:id/messages
   → 200 [{"from":"noreply@github.com","subject":"Your verification code is 483921",...}]

4) GET /api/inbox/:id/code
   → 200 {"codes":[{"type":"numeric","value":"483921","confidence":0.95,
          "context":"Your verification code is 483921"}]}

5) 上报 + 关闭
   → {"ok":true,"action":"stats_updated"} / {"ok":true}
```

**✓ 完整链路通过。**

### 它的真实限制（仍然存在，但可以接受）

正文确实取不到——`getHtml` 要 region 且返回 HTML，这个问题没变。
所以这个渠道能用，**前提是验证码出现在邮件标题里**。

- 标题含验证码（如 "Your code is 483921"）→ 能提取 ✓
- 只有正文含验证码（标题是 "Verify your email"）→ 提取不到 ✗

实际绝大多数注册邮件都会把验证码写进标题，所以这个限制影响不大。
但如果你发现某个站点总取不到码，**先看标题里有没有**，再判断是渠道问题还是站点问题。

### 手动使用

1. 浏览器打开 https://inboxkitten.com
2. 随便输一个名字（如 `myname123`），就得到 `myname123@inboxkitten.com`
3. 拿这个地址去注册
4. 回到网页刷新，就能看到邮件

> ⚠️ **inboxkitten 是完全公开的**，任何知道这个名字的人都能读这个箱。
> 而且名字太简单（如 `test`）会被人抢读。**必须用足够随机的名字**——
> Mail Hub 自动分配时会生成随机地址（如 `obiqxmdiwk`），这点是安全的。

---

## 二、MTempMail —— 已接入，但部分域名收不到信

**地址**：https://mtempmail.com
**性质**：免费 API，公开 key 写在官方文档里，已作为内置渠道（`mtempmail`）接入

### 实测：能建箱，但域名有问题

它的域名接口返回 3 个域名：

```json
{"status":true,"data":{"domains":[
  {"domain":"mtempmail.com","type":"Free"},
  {"domain":"zub.edu.pl","type":"Free"},
  {"domain":"fraudfindez.com","type":"Free"}
]}}
```

建箱正常（HTTP 200，返回地址和 email_token）。

**但实测发现问题**：分到 `fraudfindez.com` 的地址收不到信。

```
1) 建箱 → tdpvl01@fraudfindez.com
2) 直接向它的 MX（mail.mtempmail.com）投递 → SMTP 返回"投递成功"
3) 等 20 秒后查 API：
   GET /api/messages/{key}/tdpvl01@fraudfindez.com
   → {"status":false,"mailbox":"Unable to retrieve emails at this time. Please try Again","messages":[]}
4) 等 3 分钟再查 → 仍然是同样的错误
```

对照主域：

```
GET /api/messages/{key}/nokkr63@mtempmail.com
→ {"status":true,"mailbox":"nokkr63@mtempmail.com","email_token":"...","messages":[]}
```

主域 `mtempmail.com` 返回 `status: true`（正常），`fraudfindez.com` 返回 `status: false`（服务端异常）。

### 这意味着什么

**这是服务端的域名配置问题，不是 Mail Hub 的问题。** 它的域名列表里混进了收信不可用的域名。

**实际影响**：建箱时如果随机到坏域名，就收不到验证码，表现为"邮箱建出来了但一直没信"。

**建议**：如果你用这个渠道遇到收不到信，**先看地址的后缀**：
- `@mtempmail.com` → 正常
- `@fraudfindez.com` → 已知有问题，关掉重建，直到分到好域名
- `@zub.edu.pl` → 未完整测试

### 顺带发现：指定 domain 参数不生效

尝试建箱时指定 `domain: "mtempmail.com"`，实际仍然分到 `fraudfindez.com`：

```
POST /api/inbox {"provider":"mtempmail","domain":"mtempmail.com"}
→ {"address":"tdpvl01@fraudfindez.com", ...}   ← 域名被忽略
```

这说明这个渠道的 `create` 配置里没有把 `domain` 传上去——它的建箱接口不接受域名参数，服务端自己随机分配。所以要避开坏域名只能反复重建。

### 为什么仍然保留它

- 建箱稳定，响应快
- 主域 `mtempmail.com` 确认可用
- 免费、无需注册、无需 key
- 多一个渠道就多一次机会，坏域名重建一次就行

> 💡 这个渠道的价值在于"多"，不在于"稳"。如果你的场景对成功率要求高，优先用 IMAP 域名邮箱或 DuckMail。

---

## 三、Mailnesia —— 能收信，但只有 HTML 页面

**地址**：https://mailnesia.com
**性质**：老牌临时邮箱，任意地址即用，邮件保留约 7 天

### 实测：确实能收信

公共箱 `demo@mailnesia.com` 里长期有大量真实邮件。实测抓到 **40 封**：

```
第 1 封：ByteByteGo <bytebytego@substack.com> → demo@mailnesia.com
         "Last chance to get every live course in one..."
第 2 封：ByteByteGo <bytebytego@substack.com>
         "A Deep Dive into Salesforce's Agent Tech Stack"
第 3 封：Ryan Peterman <ryanlpeterman@substack.com>
         "Brian Kernighan: Inside Bell Labs..."
...
```

邮件详情页 `/mailbox/demo/1288474991` 也能打开（HTTP 200，43KB HTML）。

### 为什么接不进来

**卡在"必须返回 JSON"这一条：**

- 它**完全没有 API**，只有网页
- 列表页 `/mailbox/demo` 返回的是 `text/html`，邮件藏在 HTML 表格里
- 详情页同样是 HTML

要解析就得写爬虫，正则抠 `<tr>`、`<td>`，还要处理 HTML 实体转义（实测页面里是 `&#x3c;` 这种）。TemplateProvider 只会 `JSON.parse()`，喂 HTML 进去直接报错。

**附带问题**：它没有"建箱"概念，任意地址即用，地址格式固定 `@mailnesia.com`，这与 Mail Hub 的渠道模型也不太合。

### 手动使用的办法

1. 浏览器打开 https://mailnesia.com
2. 地址栏直接输 `https://mailnesia.com/mailbox/你的名字`
3. 用 `你的名字@mailnesia.com` 去注册
4. 刷新页面看信

---

## 四、Temp-Mail.org —— curl 能建箱，Node 被 Cloudflare 拦

**地址**：https://temp-mail.org
**性质**：最知名的临时邮箱之一，有内部 Web API

### 实测：接口本身是好的，但运行时被区别对待

**用 curl 发同样的请求，全部成功：**

```bash
curl -X POST https://web2.temp-mail.org/mailbox \
  -H "Content-Type: application/json" -d '{}'

返回 HTTP 200：
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "mailbox": "mofeget874@ofags.com"
}

再带 token 读信：HTTP 200
{"mailbox":"mofeget874@ofags.com","messages":[]}
```

**同样的请求用 Node 的 fetch 发，全部 403：**

```
Node create HTTP=403
<!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> ...
（Cloudflare 的拦截页面）
```

我甚至加了完整的浏览器 User-Agent、Origin、Referer，**仍然是 403**。

### 为什么接不进来

**卡在"Node 能连上"这一条：**

Cloudflare 不是看请求头判断的，它看 **TLS 握手的指纹**（JA3）。curl 用 OpenSSL，Node 用 BoringSSL，指纹不同。Cloudflare 认得出来"这不是真浏览器"，于是直接回拦截页。

这和请求头无关，改 `User-Agent` 没用——我实测验证过。

Mail Hub 就是 Node 程序，所以这条路在当前实现下走不通。

**字段其实是齐全的**（我从它前端 JS 里挖出来了：`bodyPreview`、`bodyHtml`、`receivedAt`、`from`、`subject`、`id`），我一度把配置写好了、渠道也建进去了，但测试连接时 `createInbox` 一直 403，最后删掉了。

### 关于「配代理能不能解决」——实测：不能

我在本机找到了一个正在运行的 HTTP 代理（`127.0.0.1:7897`），先确认它确实可用：

```
经代理访问 ipify.org → 200 {"ip":"104.28.157.112"}
（出口 IP 已变成境外，代理工作正常）
```

然后用同一个代理建 temp-mail.org 的邮箱：

```
经代理 POST /mailbox → 403（仍然是 Cloudflare 拦截页）
```

**结论：代理帮不上忙。** 因为 Cloudflare 判的是 TLS 指纹，而 Node 经代理时依旧是 Node 自己的 TLS 栈，指纹没变。换 IP 不改变指纹。

> ⚠️ 如果你之前看过"配个代理就能接 Temp-Mail.org"的说法，那是错的，我这里实测推翻了。

### 如果以后真想支持

只有两条路，都需要改环境或改代码：

- **引入能伪造浏览器 TLS 指纹的客户端**，比如 `curl-impersonate`、`bogdanfinn/tls-client`。这已经不是 TemplateProvider 配置层面能解决的了
- **自己搭一个中转**：在境外服务器上用 curl 或浏览器跑一层转发，Mail Hub 指向那个中转（相当于自建 API 网关）

两条都超出"加个渠道配置"的范畴。

---

## 五、Inboxes.com —— 端点太少，做不成渠道

**地址**：https://inboxes.com
**性质**：SvelteKit 做的临时邮箱，任意地址即用

### 实测：能访问，但只暴露一个端点

```
GET /api/v2/inbox/demo   → 200 {"msgs":[]}
```

这个端点连续测 6 次、带不带浏览器头都稳定 200（之前偶尔 403 是 Cloudflare 限流，不是永久拦截）。

但我把能想到的端点全试了一遍，**只有这一个存在**：

```
GET /api/v2/domains             → 404 Route not found
GET /api/v2/me                  → 404 Route not found
GET /api/v2/inbox/demo/messages → 404 Route not found
GET /api/v2/message/demo/1      → 404 Route not found
GET /api/v2/inbox/demo/1        → 404 Route not found
```

### 为什么接不进来

**卡在"能建箱"和"正文能取到"两条：**

1. **没有建箱接口**——不过这个可以绕过，`create.skip: true` + 固定域名就行
2. **没有邮件详情接口**——这是硬伤。它的列表返回 `{msgs: [...]}`，但拿不到单封邮件的正文。没有正文就提取不了验证码
3. **没有域名列表**——只能硬编码 `inboxes.com`

加上它的公共箱实测都是空的（试了 test/demo/hi/mail/a/aaa/test1/user/admin/inbox 十个名字，全是 0 封），也**没法验证它到底能不能真收到信**——我尝试直接向它的 MX 投递，被 `550 Relaying denied` 拒了（它用的是 Mailgun，但只接受特定来源）。

所以严格说：**它的收信能力我无法证实**。它能读箱，但读不到东西。

### 顺带发现：GetNada 已经并进来了

老牌的 **getnada.com 现在只是 Inboxes.com 的跳板**。实测直接打开 getnada.com，返回的
HTML 里只有一段迁移脚本：读浏览器的 localStorage，POST 到
`https://inboxes.com/api/v2/legacy/migration`，然后 `location.href = 'https://inboxes.com'`。

所以"Nada"和"Inboxes.com"是同一家（inboxes.com 页脚也写着 © Nada™），老 getnada
的账号被引导迁移过去。它的局限和 Inboxes.com 一样（没有详情接口），不用再单独调研。

### 手动使用的办法

浏览器打开 https://inboxes.com，输名字即用。但**没有证据表明它能稳定收信**，不推荐依赖。

---

## 六、Mailsac —— 有正规 API，但需要注册付费

**地址**：https://mailsac.com
**性质**：商业临时邮箱，API 文档齐全，有免费额度

### 实测

```
GET https://mailsac.com/api/addresses/demo@mailsac.com/messages
→ 401 {"message":"Not authorized. You may need to log in first."}
```

### 为什么接不进来

**卡在"无需交互式认证"这一条**，但这是**最接近可用**的一个：

它其实**完全符合** TemplateProvider 的模型（JSON API、有建箱、有正文、字段清晰），唯一的问题是所有请求都要带 API Key。

**这个可以接**，步骤是：

1. 去 https://mailsac.com 注册账号（有免费额度，但很小）
2. 在账号设置里生成 API Key
3. 在 Mail Hub 自定义渠道里新建，认证方式选 **API Key Header**：
   - Header 名：`Mailsac-Key`
   - 值：你的 key
4. 按它文档配各端点

> ⚠️ 我没帮你配，因为需要你注册账号拿 key，而且要花钱。如果你有账号，这个是可以加进来的。

**参考端点**（据其公开文档）：
- 列表：`GET /api/addresses/{email}/messages`
- 详情：`GET /api/addresses/{email}/messages/{id}`
- 删除：`DELETE /api/addresses/{email}`

---

## 七、Cloudflare 拦住的其他几类

下面这些**都是被 Cloudflare 的 JS 挑战挡住的**（返回 `403 + Just a moment...`），
需要真浏览器执行 JavaScript 才能拿到 cookie，Node 直接请求一律失败：

| 服务 | 地址 | 实测返回 |
|------|------|---------|
| Mailinator | mailinator.com | 403 Just a moment（公开箱读取） |
| TempMailo | tempmailo.com | 403 Just a moment |
| 10MinuteMail | 10minutemail.com | 403 Just a moment |
| Tempail | tempail.com | 403 Just a moment |
| Harakiri Mail | harakirimail.com | 403 Just a moment |
| TrashMail | trashmail.com / trashmail.de | **403 Attention Required（硬拦截，连 JS 挑战都不是）** |

> ⚠️ TrashMail 单独说一下：trashmail.com 现在 308 重定向到 `mail.aionda.com`，
> 后者对 Node 和 curl 都直接回 **"Attention Required" + Cloudflare Ray ID**——
> 这是 CF 的**拒绝访问页**，不是"Just a moment"那种 JS 挑战。区别在于：
> JS 挑战理论上真浏览器过一次就能拿到 cookie，硬拦截是直接按 IP/指纹拉黑，
> 浏览器打开也一样 403。这个网络环境下它属于彻底没门。

这类服务**本身可能完全能用**（浏览器里打开就是正常邮箱），只是自动化接不进来。

---

## 八、连不上的（网络层面）

下面这些是 DNS 解析失败或 TCP 连接被拒，属于网络可达性问题，
**不代表服务已死**——换个网络环境（或用代理）可能就好了：

| 服务 | 现象 |
|------|------|
| Mail.gw | 连接被拒（1013） |
| Guerrilla Mail | 连接失败（多个域名都不通） |
| 1secmail | TLS 证书校验失败（证书名不匹配） |
| Tempmail.plus | 连接超时 |
| YOPmail | 连接超时 |
| Moakt | 404（可能改了接口） |
| Tmailor | 返回 `{"msg":"error"}` |
| generator.email | 连接超时（emailfake 同族的主域，本网络不通） |
| Mailcatch | 连接超时 |
| MinuteInbox | 连接超时 |
| ThrowAwayMail | 连接超时 |
| Ethereal Mail | 连接超时（Nodemailer 官方测试邮箱，海外开发者用得多） |
| MyTemp.email | 连接超时 |
| Dispostable | 连接超时 |
| Rootsh | 连接超时 |
| 24mail.chacuo.net | 连接超时（中文老牌临时邮箱，可能只对国内特定网络友好，本机也不通） |

> ☠️ **FakeInbox 是另一种死法：域名活着，服务没了。** https://www.fakeinbox.com
> 返回 200，但内容是一个 **WordPress 博客**（文章全是"Best VPN 2026"这类 SEO 内容，
> 还开着 wp-json），原来的临时邮箱功能一点不剩。
> 教训：**探活时别只看 HTTP 200，要看页面还是不是邮箱**。

---

## 九、EmailFake —— 服务活着，但接口层层设卡

**地址**：https://emailfake.com
**性质**：老牌"假邮箱生成器"（generator.email / 10minutemail 等一大票站点的同族引擎），打开首页就自动分配一个随机邮箱（实测分到 `flamino@newbreedapps.com`），WebSocket 推新信提醒

### 实测：网页是完整的，接口全是门禁

我从它的前端 JS（`/js/inbox.js`）里挖出了全部内部接口：

```
GET  /api/domains.php          域名列表
GET  /search.php?key=...       域名搜索
POST /mark_remove.php          新信轮询：body "chekinbox=<地址>"，返回 0/1
POST /mark_remove.php          标记已读：body "mark=<secret>"
WSS  /notificon/ws?email=...   新信通知
```

**逐条实测的结果：**

```
1) curl https://emailfake.com/api/domains.php
   → 403 "Origin/Referer required"

2) 它自己的 JS 调这些接口时带两个头：
   X-API-Token: apiToken()        ← 由 /__ab_fp2.js、ab_guard.js 等指纹脚本生成
   X-Requested-With: XMLHttpRequest
   403 时前端直接 location.reload() 换 token 重试

3) 邮件列表本身不是接口——页面刷新后由服务端渲染进 HTML
   （mark_remove.php 只回答"有没有新信"，拿到信靠 reload）

4) 读单封邮件还要过验证码：inbox.js 里 fetchSource(..., '&cap=...&capt...')
   未过验证码时弹 captcha，这是给非管理员读信的固定门槛
```

### 为什么接不进来

**同时卡在"必须返回 JSON"和"无需交互式认证"两条：**

1. 邮件列表和正文都没有 JSON 接口，列表是服务端渲染 HTML——和 Mailnesia 同一类问题
2. 仅有的 JSON 接口（域名/搜索）被 Origin/Referer + 浏览器指纹 token 双重门禁挡住，Node 复现不了 token 生成
3. 读信要过验证码——这一条连"手动自动化"都堵死了

它比 Mailnesia 还难缠：Mailnesia 至少页面结构稳定可以爬，这里读信先要人机验证。

### 手动使用的办法

浏览器打开 https://emailfake.com，自动分配地址即用；换地址点页面上的域名/用户名输入框。
读信过一下验证码就行。**收信能力本身没问题**（整套体系还在活跃运营），
但我没能通过 HTTP 拿到真实邮件数据验证——列表在 JS 渲染之后才出现。

---

## 十、SmailPro —— API 在，但凭据藏在 App 里

**地址**：https://smailpro.com
**性质**：界面花哨的临时邮箱（有网页版和手机 App），后端 API 在 `api.sonjj.com`

### 实测

```
GET https://api.sonjj.com/v1/temp_email
→ 401 {"statusCode":401,"error":"Unauthorized","message":"app: Invalid credentials"}
```

`"app: Invalid credentials"` 这个报错说明：**API 要求 App 端内嵌的凭据**（大概是给
iOS/Android 客户端签发的）。网页版首页能打开（22KB 的 SPA），但它的邮件操作全部
走 App 凭据 + 前端加密 payload，网页源码里抠不出可复用的请求。

### 为什么接不进来

**卡在"无需交互式认证"这一条**——和 Mailsac 类似（都需要 key），但更糟：

- Mailsac 的 key 你自己注册就有，流程公开透明
- SmailPro 的凭据藏在它的 App 二进制里，官方没有对外的 API 申请入口

除非有人逆向它的 App 拿到签名算法（那已经是逆向工程，超出"加渠道"范畴），否则接不了。

### 手动使用的办法

网页打开 https://smailpro.com 即用（界面会引导选域名）。私密性未知，收信能力未实测——
连不上它的 API，我没有证据证明它当前收信正常，用前自己先发封测试信。

---

## 十一、EmailOnDeck —— hCaptcha 挡在创建邮箱这一步

**地址**：https://www.emailondeck.com
**性质**：存活很久的老牌临时邮箱，理念是"邮箱地址短时间有效，用完即焚"

### 实测

```
https://emailondeck.com → 301 → https://www.emailondeck.com/ → 200（站活着）

首页 HTML 里直接躺着 hCaptcha：
  sitekey="6a356ce3-1f27-4646-a85e-e9dbce83ced6"

另有 recover_email_address.php 等端点，主流程（创建邮箱/读信）都要先过 hCaptcha
```

### 为什么接不进来

**卡在"无需交互式认证"这一条**：创建邮箱这一步就要过 hCaptcha，验证码不过，
后面的一切（地址、token、收信）都不存在。TemplateProvider 没有任何地方能塞
"先解个验证码"这种交互。

和第七节那批 CF 拦截不同——EmailOnDeck 没拦你的请求，它是**故意**用验证码把
自动化挡在门外的（这是它的商业模式：防滥用）。这类"主动反自动化"的服务，
加渠道无解。

### 手动使用的办法

浏览器打开 https://www.emailondeck.com，过一下 hCaptcha，它会给你一个地址。
收信能力未实测（我没法替你过验证码），但这个服务运营了很多年，可靠性口碑尚可。

---


## 小结：想加渠道时的判断顺序

遇到一个候选服务，按这个顺序快速判断，不用全测：

```
1. 用 curl 打一下它的 API
   ↓ 连不上？
   └→ 网络问题。先配代理再试，或用浏览器确认服务是否活着

2. 返回的是 JSON 吗？
   ↓ 是 HTML
   └→ 接不了。TemplateProvider 只吃 JSON

3. 在 Node 里再打一次（node -e "fetch(...)"）
   ↓ curl 能过、Node 403 且带 "Just a moment"
   └→ Cloudflare 按 TLS 指纹拦截。配代理也解决不了（我实测过），
      只能放弃，或自建境外中转

4. 有建箱接口吗？没有的话地址能随便用吗？
   ↓ 都不行
   └→ 接不了

5. 列表接口里有什么？（这一步最容易漏，也是我当初判错的地方）
   ↓ 列表里已有 subject / text / html
   └→ 用 fromList 模式就够了，不用碰详情接口，能接！
       （InboxKitten 就是这种：详情接口用不了，但标题里有验证码）

6. 列表里没有正文，那有详情接口能拿到吗？
   ↓ 没有
   └→ 接不了。没正文又没标题，提不出验证码

7. 详情 URL 需要额外参数（不在 {{messageId}} 里）吗？
   ↓ 需要
   └→ 接不了

8. 全过了 → 能接。写好配置用真实邮件验证
```

**三个关键提醒**：

- 第 1 步用 curl、第 3 步必须用 Node 重测。我就是靠这个对比，才发现 Temp-Mail.org 是"curl 能过、Node 被拦"的
- **第 5 步别跳过**。我当初只看正文接口就判定 InboxKitten 接不了，后来发现列表里的 `subject` 就够用了。**先看列表里有什么，再考虑详情接口**
- **HTTP 200 ≠ 服务活着**。FakeInbox 返回 200，但已经是个博客。第 1 步连上后扫一眼内容是不是还是邮箱，再往下走

---

## 关于验证方法的一点说明

判断渠道能不能用，**光看接口返回 200 不算数**，必须真实投递一封邮件再看能不能取到码。

我踩过的坑：

| 看似通过 | 实际问题 |
|---------|---------|
| 建箱返回 201 | 只是建了地址，不代表能收信 |
| 邮件列表 `{"messages":[]}` 返回 200 | 空列表也是 200，看不出能不能收 |
| SMTP 返回"投递成功" | 只代表 MX 收下了，不代表进得了目标邮箱 |
| 调度预演显示"可用" | 纯本地计算，不碰上游，什么都证明不了 |

**唯一可信的验证**：真实投递一封带验证码的邮件 → 等 → 调 `/code` 看有没有取出来。

这次三个渠道的结论都是这么来的：
- DuckMail：真实邮件 → 取到 `483921` ✓
- InboxKitten：真实邮件 → 取到 `483921` ✓
- MTempMail：真实邮件 → 收不到（域名问题）✗

---

## 附：这些服务的手动用法对比

接不进渠道，不代表不能用。手动操作的话：

| 服务 | 状态 | 手动使用难度 | 公开性风险 |
|------|------|-------------|-----------|
| **DuckMail** | ✅ 已接入 | 无需手动，直接用 | ✅ 私有（有 token） |
| **InboxKitten** | ✅ 已接入 | 打开网页输名字即用 | ⚠️ 完全公开，任何人可读 |
| **MTempMail** | ⚠️ 部分可用 | 无需手动，直接用 | ✅ 私有 |
| Mailnesia | ❌ 接不进 | 改地址栏 `/mailbox/名字` | ⚠️ 公开，且保留 7 天 |
| Temp-Mail.org | ❌ 接不进 | 打开网页，自动分配 | ✅ 有 token 保护，较私密 |
| Inboxes.com | ❌ 接不进 | 打开网页输名字 | 未验证能否收信 |
| Mailsac | ❌ 需付费 | 需注册付费 | ✅ 私有 |
| EmailFake | ❌ 接不进 | 打开网页即用，读信要过验证码 | ⚠️ 部分公开（同族站点互相能看到热门箱） |
| SmailPro | ❌ 接不进 | 打开网页/App 即用 | 未验证（API 要 App 凭据） |
| EmailOnDeck | ❌ 接不进 | 网页过 hCaptcha 即用 | ✅ 私有 |
| TrashMail | ❌ 接不进 | 本网络连网页都打不开（CF 硬拦截） | — |
| FakeInbox | ☠️ 服务已死 | 域名还在，但已是博客 | — |
| GetNada | 🔀 已并入 | 直接用 Inboxes.com | 同 Inboxes.com |

> 🔒 **公开性这件事很重要**：InboxKitten 和 Mailnesia 都是"知道名字就能读"。
> 如果你用它们收验证码，**名字必须够随机**（比如 `xk29fjq1`），千万别用 `test`、`abc` 这种。
> Mail Hub 自动分配时会生成随机地址，这点是安全的；手动用网页版时就得自己注意。
>
> 反过来 Temp-Mail.org 和 DuckMail 分配地址时给了 token，别人猜不到，更安全。

---

## 变更记录

| 日期 | 内容 |
|------|------|
| 2026-10-27（初版） | 首次整理。InboxKitten 用 SMTP 真实投递验证收信；Mailnesia 从公共箱抓到 40 封真实邮件；Temp-Mail.org 与 Inboxes.com 做了 curl / Node 对照测试 |
| 2026-10-27（更正） | **推翻 InboxKitten 的判断**：初版说它接不进（因为正文接口要 region 且返回 HTML），实际列表接口的 `subject` 就够用，已作为内置渠道接入并完整验证通过 |
| 2026-10-27（新增） | 补充 MTempMail 实测：能建箱，但 `fraudfindez.com` 域收不到信（服务端问题）；DuckMail 与 InboxKitten 均用真实邮件跑通完整链路 |
| 2026-10-27（第二批） | 新增 EmailFake（接口指纹门禁 + 读信验证码）、SmailPro（API 要 App 凭据）、EmailOnDeck（hCaptcha）三节；发现 TrashMail 被 Cloudflare 硬拦截、FakeInbox 已沦为博客、GetNada 并入 Inboxes.com；网络不可达清单扩充 9 个 |
