import { Bot, Network, Puzzle, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  base: Bot,
  eco: Puzzle,
  part: Network,
};

export default function WorkScopeIcon({
  id,
  size = 14,
  className,
}: {
  id: string;
  size?: number;
  className?: string;
}) {
  const Icon = ICONS[id] ?? Network;
  return <Icon size={size} className={className} aria-hidden="true" />;
}
