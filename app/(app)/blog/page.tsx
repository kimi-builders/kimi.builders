/* 月刊总览已并入探索区(20260821):/blog → /explore。 */
import { redirect } from "next/navigation";

export default function BlogPage() {
  redirect("/explore");
}
