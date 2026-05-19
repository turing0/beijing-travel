# 北京三日 · 我们的行程

一个用 Next.js 做的可编辑旅行计划网站：5 月 29 日（周五）—31 日（周日）在北京的三天行程。
两个人改的是同一份，几秒内自动同步。

预置项目：陶艺、调香、拼豆、看电影，以及航班 / 吃饭 / 游览。每一项都能改时间、
活动、类型、地点、备注，可增删、上下调顺序，还能标记「两人都同意」。

## 本地运行

```bash
npm install
npm run dev
```

打开 http://localhost:3000 。
本地没配数据库时，数据会自动存到项目里的 `.data/` 文件夹（已被 git 忽略），
一个人测试没问题；要两个人一起实时改，需要按下面部署。

## 部署到 Vercel（两个人一起实时改）

1. 注册 [Upstash](https://upstash.com)（免费），新建一个 Redis 数据库。
2. 在数据库详情页的 **REST API** 区，复制 `UPSTASH_REDIS_REST_URL` 和
   `UPSTASH_REDIS_REST_TOKEN`。
3. 把这个仓库导入 [Vercel](https://vercel.com/new)，在
   **Settings → Environment Variables** 里把上面两个值填进去，部署。
4. 打开网站后，把地址栏里带 `?room=xxxx` 的完整链接（或点页面上「复制邀请链接」）
   发给她。你俩打开同一个链接，就是同一份行程，谁改了对方几秒内自动看到。

数据存在 Upstash 时，断开重连、换设备都不会丢；本地文件模式仅用于本地开发。
