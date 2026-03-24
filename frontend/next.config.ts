import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 確保 Supabase env vars 只在 server side 使用（不暴露到 client）
}

export default nextConfig
