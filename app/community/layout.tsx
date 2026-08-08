/* 社区分区外壳:顶栏 + 窄栏阅读容器(max-w-3xl)。 */
import SiteHeader from "@/components/SiteHeader";

export default function CommunityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-5 pb-24">{children}</div>
    </>
  );
}
