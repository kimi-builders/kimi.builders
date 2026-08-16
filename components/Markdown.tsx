/* 用户 Markdown 正文渲染。react-markdown 默认不执行原始 HTML(无 XSS 面),
   GFM 支持表格/删除线/任务列表;样式走 globals.css 的 .md 块。
   rehypeKimiMention(20260816):@kimi 召唤词高亮(代码块内除外)。 */
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
