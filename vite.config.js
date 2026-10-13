import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const port = Number.parseInt(process.env.PORT || "8787", 10);
const hmrPort = Number.parseInt(process.env.VITE_HMR_PORT || String(port + 100), 10);

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // V4.0 建议3（2026-10-13）：把大第三方依赖拆成独立 chunk，压低首屏单包体积、
        // 改善浏览器缓存命中（vendor 不常变），缓解低端机解析单包的压力。
        // 应用代码保持默认打包；仅对 node_modules 做分组，不影响运行时正确性。
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) return "react-vendor";
            if (id.includes("/lucide-react/")) return "icons";
            return "vendor";
          }
          // 应用代码按功能域拆分：src/features/<域> 各自成块，入口 main + 共享模块留 index。
          // 各功能域静态 import，浏览器首屏仍会加载，但单块体积下降、不常变的域可独立缓存。
          const feat = id.match(/[\\/]src[\\/]features[\\/]([^\\/]+)/);
          if (feat && feat[1]) return "feat-" + feat[1];
        }
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port,
    watch: {
      ignored: ["**/.secure-build/**", "**/.release-temp/**", "**/dist/**"]
    },
    ...(Number.isFinite(hmrPort) ? { hmr: { host: "127.0.0.1", port: hmrPort } } : {})
  }
});
