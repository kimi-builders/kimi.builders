/* The monthly overview merged into explore: /blog -> /explore. */
import { redirect } from "next/navigation";

export default function BlogPage() {
  redirect("/explore");
}
