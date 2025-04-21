# 地震信息聚合与可视化应用 (Demo)

本项目是一个基于 Ant Design Pro 构建的前后端分离的地震信息聚合与可视化应用示例。

## 主要功能与页面

1.  **实时地震地图 (`/realtime-map`)**
    *   使用高德地图 JS API 展示全球实时地震活动。
    *   地图标记的大小和颜色随地震震级动态变化。
    *   点击标记可查看包含详细信息的窗体（时间、震级、深度、位置、状态、海啸预警、USGS链接等）。
    *   侧边信息面板包含：
        *   图例说明。
        *   按震级范围和时间范围筛选地震数据的功能。
        *   基于当前筛选结果的统计概要信息。

2.  **地震概览仪表盘 (`/` 或 `/welcome`)**
    *   展示过去 24 小时核心地震统计数据 (M2.5+)。
    *   提供过去 7 天 M4.5+ 的近期强震列表，包含指向 USGS 详情页的链接。

3.  **地震波形分析 (`/diting-model`)**
    *   允许用户上传本地地震波形数据文件 (如 `.mseed`, `.sac` 等格式)。
    *   调用后端服务，使用 DiTing 深度学习模型进行分析。
    *   展示后端返回的分析结果图表。

4.  **设置与资源 (`/admin`)**
    *   提供相关的外部链接：
        *   数据来源 (USGS GeoJSON Feeds)
        *   地震知识科普网站
        *   主要国家/地区的应急响应机构
        *   防震减灾指南
    *   包含应用的简要说明和使用的主要技术栈。
    *   提供一个本地设置的示例（通过 `localStorage` 保存仪表盘自动刷新偏好）。

## 项目架构

*   **前端**: 使用 Ant Design Pro (基于 UmiJS 和 React) 构建用户界面和交互逻辑。
*   **后端**: **需要一个独立的后端服务 (推测为 Flask 应用)** 来处理地震波形分析请求。前端通过 UmiJS 的代理设置将 `/flask-api` 前缀的请求转发到实际的后端服务地址。
*   **数据**: 地图和仪表盘数据主要来自公开的 USGS GeoJSON Feeds；波形分析依赖用户上传和后端处理。

## 技术栈

**前端:**
*   React
*   Ant Design / Ant Design Pro
*   UmiJS (含代理配置)
*   高德地图 JS API v2.0
*   TypeScript
*   Day.js (用于日期时间处理)
*   @ant-design/charts (已安装，当前未使用)

**后端 (根据前端代码推测):**
*   Python / Flask (处理 `/flask-api/process` 和 `/flask-api/resources/picture/*` 请求)
*   DiTing 模型 (或其他地震分析库/模型)

## 数据来源

*   USGS GeoJSON Feeds: [https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php)
*   用户上传的地震波形数据

## 环境准备与运行

**重要提示:** 本项目需要独立运行的前端和后端服务。

**1. 后端服务:**

   **(请在此处补充后端服务的具体设置和启动步骤)**

   *   例如：依赖安装 (`pip install ...`)、环境配置、启动命令 (`python app.py` 或类似命令)。
   *   确保后端服务运行在 UmiJS 代理配置 (`config/proxy.ts` 或 `.umirc.ts` 中配置) 指向的地址和端口上（例如 `http://localhost:5000`）。

**2. 前端服务:**

   a. **安装依赖:**

      ```bash
      npm install
      # or
      yarn
      ```

   b. **配置高德地图 API Key:**

      在 `src/pages/RealtimeEarthquakeMap/index.tsx` 文件中修改 `AMapKey` 常量。

      ```typescript
      // 高德地图 API Key
      const AMapKey = '您的高德地图API Key'; // 我已配置
      ```

   c. **启动前后端开发服务器:**
    
      ```bash
      前端
      ./start_frontend.sh

      后端
      ./start_backend.sh

      ```

      前端项目将在本地启动（通常是 `http://localhost:8000`）。确保后端服务已在运行，以便波形分析功能正常工作。

## 其他脚本

*   构建前端项目: `npm run build`
*   代码风格检查: `npm run lint`
*   自动修复部分 Lint 错误: `npm run lint:fix`
*   运行测试: `npm test`

## 更多信息

关于 Ant Design Pro 的更多用法，请查阅其 [官方网站](https://pro.ant.design)。
