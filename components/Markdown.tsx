/* User Markdown rendering. react-markdown never executes raw HTML by
   default (no XSS surface); GFM adds tables/strikethrough/task lists;
   styling lives in globals.css's .md blocks. rehypeKimiMention:
   highlights @kimi summons (except inside code blocks). */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { rehypeKimiMention } from "@/src/lib/mention-kimi";

export default function Markdown({ source }: { source: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeKimiMention]}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
