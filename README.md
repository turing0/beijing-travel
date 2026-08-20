# 我们的旅行计划

一个用 Next.js 做的多人协作旅行计划网站：选好城市和日期自动生成按天的空白行程，
把邀请链接发给同伴，你们改的就是同一份，几秒内自动同步。

每个行程有备忘清单和按天排列的活动卡片。每项活动都能改时间、标题、地点、备注，
可增删、拖拽排序（也能拖到别的天），还能标记「都同意」。空行程可一键载入三日示例
作为起点。

## 本地运行

```bash
npm install
npm run dev
```

打开 http://localhost:3000 。
本地没配数据库时，数据会自动存到项目里的 `.data/` 文件夹（已被 git 忽略），
一个人测试没问题；要多人一起实时改，需要按下面部署。

## 部署到 Vercel（多人实时协作）

1. 注册 [Upstash](https://upstash.com)（免费），新建一个 Redis 数据库。
2. 在数据库详情页的 **REST API** 区，复制 `UPSTASH_REDIS_REST_URL` 和
   `UPSTASH_REDIS_REST_TOKEN`。
3. 把这个仓库导入 [Vercel](https://vercel.com/new)，在
   **Settings → Environment Variables** 里把上面两个值填进去，部署。
4. 在首页创建行程后，点「复制邀请链接」发给同伴。大家打开同一个链接
   （`/trip/房间号`），就是同一份行程，谁改了对方几秒内自动看到。

数据存在 Upstash 时，断开重连、换设备都不会丢；本地文件模式仅用于本地开发。
