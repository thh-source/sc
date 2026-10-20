declare namespace Cloudflare {
  interface Env {
    ASSETS: Fetcher;
    DB: D1Database;
    BUCKET: R2Bucket;
    MASTER_ADMIN_ID?: string;
    SYNC_SECRET?: string;
    IMAGES?: any;
  }
}

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  BUCKET: R2Bucket;
  MASTER_ADMIN_ID?: string;
  SYNC_SECRET?: string;
  IMAGES?: any;
}
