import type { Metadata } from "next";
import { readDoc } from "../../lib/store";

// 房间页的分享预览：直接用这份行程自己的标题和副标题，
// 这样发出去的链接显示的是“成都五日 · 我们的行程”而不是站点默认文案。
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const doc = await readDoc(id).catch(() => null);
  const title = doc?.plan?.title?.trim();
  const description =
    doc?.plan?.subtitle?.trim() || "一起编辑、实时同步的旅行计划。";
  if (!title) {
    return { title: "我们的旅行计划", description };
  }
  return {
    title,
    description,
    openGraph: { title, description },
  };
}

export default function TripLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
