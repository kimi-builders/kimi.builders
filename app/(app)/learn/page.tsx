/* The tutorial catalog merged into explore: /learn -> /explore. */
import { redirect } from "next/navigation";

export default function LearnPage() {
  redirect("/explore");
}
