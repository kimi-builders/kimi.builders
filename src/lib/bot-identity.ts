/* Bot identity constants: client components (the summon pending row)
   need them too, so they moved out of ai-reply.ts into a dependency-free
   module — importing ai-reply client-side would bundle the mysql pool.
   ai-reply.ts re-exports; existing imports unaffected. */
export const BOT_NAME = "Kimi 小筑";
/* Small tile mark (crescent + twin star enlarged, on dark): legible at
   20px in comments, stable across themes. */
export const BOT_AVATAR = "/brand/logo-tile.svg";
