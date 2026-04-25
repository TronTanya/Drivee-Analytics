/** @type {import('next').NextConfig} */
const proxyTarget = (process.env.API_PROXY_TARGET || "http://127.0.0.1:8000").replace(/\/$/, "");

const nextConfig = {
  experimental: {
    typedRoutes: true,
    /** Долгие запросы через rewrites (например LLM в `/api/v1/analytics/run`) — иначе dev/proxy режет соединение (~30 с) → ECONNRESET / 500. */
    proxyTimeout: Number(process.env.NEXT_PROXY_TIMEOUT_MS || 300_000)
  },
  /** Прокси API на бэкенд: браузер ходит на тот же origin (избегаем CORS и неверного порта). */
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${proxyTarget}/api/:path*` },
      { source: "/health", destination: `${proxyTarget}/health` },
      /** Ноутбук дергает `/health/runtime` с same-origin (`getApiBaseUrl()` пустой) — без rewrite Next отдаёт 404. */
      { source: "/health/runtime", destination: `${proxyTarget}/health/runtime` }
    ];
  }
};

export default nextConfig;
