/* 教程频道目录已并入探索区(20260821):/learn → /explore。 */
import { redirect } from "next/navigation";

export default function LearnPage() {
  redirect("/explore");
}
