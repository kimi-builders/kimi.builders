import {
  AppWindow,
  BookOpen,
  Bot,
  Globe,
  MessageSquareText,
  MonitorPlay,
  Presentation,
  Puzzle,
  Shapes,
  Smartphone,
  Terminal,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  app: AppWindow,
  miniapp: Smartphone,
  website: Globe,
  extension: Puzzle,
  cli: Terminal,
  skill: Bot,
  prompt: MessageSquareText,
  slides: Presentation,
  demo: MonitorPlay,
  content: BookOpen,
  other: Shapes,
};

export default function WorkKindIcon({
  id,
  size = 14,
  className,
}: {
  id: string;
  size?: number;
  className?: string;
}) {
  const Icon = ICONS[id] ?? Shapes;
  return <Icon size={size} className={className} aria-hidden="true" />;
}
