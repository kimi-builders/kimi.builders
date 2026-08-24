/* The monthly overview merged into explore: /blog -> /explore (308). */
import { permanentRedirect } from "next/navigation";

export default function BlogPage() {
  permanentRedirect("/explore");
}
