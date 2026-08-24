/* The tutorial catalog merged into explore: /learn -> /explore (308). */
import { permanentRedirect } from "next/navigation";

export default function LearnPage() {
  permanentRedirect("/explore");
}
