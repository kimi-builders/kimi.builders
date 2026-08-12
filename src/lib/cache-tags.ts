/* Public data-cache tags live in a dependency-free module so mutation paths can
   invalidate them without importing the cached query (or its database graph). */
export const PUBLIC_POSTS_CACHE_TAG = "public:posts";
export const PUBLIC_USERS_CACHE_TAG = "public:users";
