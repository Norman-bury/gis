import React, { useState, useEffect, useRef, useMemo } from 'react';
import { PageContainer } from '@ant-design/pro-layout';
import { Card, Spin, Button, message, Alert, Row, Col, Slider, DatePicker, Statistic, Divider, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import AMapLoader from '@amap/amap-jsapi-loader';
import type { RangePickerProps } from 'antd/es/date-picker';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
import styles from './index.less';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

// --- 全局类型声明 ---
declare global {
  interface Window {
    AMap: any; // 或者更具体的类型，如果知道的话
  }
}
// --- 类型声明结束 ---

// 定义 USGS 地震数据接口返回的 Feature 类型
interface USGSFeature {
  type: 'Feature';
  properties: {
    mag: number | null;
    place: string | null;
    time: number | null; // 时间戳
    updated: number | null;
    tz: any; // 时区信息，可能为 null
    url: string | null;
    detail: string | null; // 详细信息 URL
    felt: number | null; // 有感报告数量
    cdi: number | null; // 社区互联网烈度
    mmi: number | null; // 修正墨卡利烈度
    alert: string | null; // 警报级别 (e.g., "green", "yellow")
    status: string; // "automatic", "reviewed"
    tsunami: number; // 0 or 1
    sig: number; // 重要性评分
    net: string; // 报告网络 (e.g., "us")
    code: string; // 事件代码
    ids: string; // 相关 ID
    sources: string; // 数据来源
    types: string; // 事件类型 (e.g., ",earthquake,")
    nst: number | null; // 使用的台站数量
    dmin: number | null; // 到最近台站的水平距离 (度)
    rms: number | null; // 均方根误差 (秒)
    gap: number | null; // 最大方位角间隙 (度)
    magType: string | null; // 震级类型 (e.g., "ml", "mb", "mw")
    type: string; // 事件类型 (e.g., "earthquake")
    title: string; // 事件标题
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number, number]; // [经度, 纬度, 深度(km)]
  };
  id: string; // 事件 ID
}

// 定义 USGS 地震数据接口返回的整体结构
interface USGSData {
  type: 'FeatureCollection';
  metadata: {
    generated: number;
    url: string;
    title: string;
    status: number;
    api: string;
    count: number;
  };
  features: USGSFeature[];
  bbox?: [number, number, number, number, number, number];
}

// 高德地图 API Key
const AMapKey = '35580e9f69fbee52787cecc400343936';
// USGS API Endpoint
const USGS_API_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';

// 定义统计数据类型 (可选，但推荐)
interface EarthquakeStats {
  totalCount: number;
  maxMagnitude: number | null;
  minMagnitude: number | null;
  avgMagnitude: number | null;
  countByMagnitude: Record<string, number>; // 例如: { '<3': 10, '3-5': 5, ... }
}

// 定义图例项
const legendMagnitudeLevels = [
  { range: '< 3', mag: 2.5, label: '微小 (M < 3)' },
  { range: '3-5', mag: 4, label: '弱 (3 ≤ M < 5)' },
  { range: '5-6', mag: 5.5, label: '中等 (5 ≤ M < 6)' },
  { range: '6-7', mag: 6.5, label: '强 (6 ≤ M < 7)' },
  { range: '>= 7', mag: 7.5, label: '大 (M ≥ 7)' },
  { range: '未知', mag: null, label: '未知震级' },
];

// 新增：统计计算函数
const calculateStats = (quakes: USGSFeature[]): EarthquakeStats | null => {
    if (!quakes || quakes.length === 0) {
        return null;
    }

    let minMag: number | null = null;
    let maxMag: number | null = null;
    let sumMag = 0;
    let validMagCount = 0;
    const countByMag: Record<string, number> = {
        '< 3': 0,
        '3-5': 0,
        '5-6': 0,
        '6-7': 0,
        '>= 7': 0,
        '未知': 0,
    };

    quakes.forEach(quake => {
        const mag = quake.properties.mag;
        if (mag !== null) {
            if (minMag === null || mag < minMag) minMag = mag;
            if (maxMag === null || mag > maxMag) maxMag = mag;
            sumMag += mag;
            validMagCount++;

            // 分类计数
            if (mag < 3) countByMag['< 3']++;
            else if (mag < 5) countByMag['3-5']++;
            else if (mag < 6) countByMag['5-6']++;
            else if (mag < 7) countByMag['6-7']++;
            else countByMag['>= 7']++;
        } else {
            countByMag['未知']++;
        }
    });

    const avgMag = validMagCount > 0 ? sumMag / validMagCount : null;

    return {
        totalCount: quakes.length,
        maxMagnitude: maxMag,
        minMagnitude: minMag,
        avgMagnitude: avgMag,
        countByMagnitude: countByMag,
    };
};

const RealtimeEarthquakeMap: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null); // 存储地图实例
  const infoWindowRef = useRef<any>(null); // 存储信息窗体实例
  const [loading, setLoading] = useState<boolean>(true);
  const [mapLoading, setMapLoading] = useState<boolean>(true);
  const [earthquakes, setEarthquakes] = useState<USGSFeature[]>([]);
  const [error, setError] = useState<string | null>(null);
  const markersRef = useRef<any[]>([]); // 存储地图上的标记

  // --- 新增 State ---
  // 震级筛选范围 [min, max]，0-10级
  const [magnitudeRange, setMagnitudeRange] = useState<[number, number]>([0, 10]);
  // 时间筛选范围 [start, end]，null 表示不限制
  const [timeRange, setTimeRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  // 统计数据 (初始为空)
  const [stats, setStats] = useState<EarthquakeStats | null>(null);

  // --- 辅助函数 ---
  // 格式化时间 (使用 dayjs)
  const formatTime = (timestamp: number | null): string => {
    if (!timestamp) return '未知时间';
    // 注意：USGS 时间戳是毫秒
    return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss');
  };

  // 获取震级颜色 (可根据实际需求调整)
  const getMagnitudeColor = (mag: number | null): string => {
    if (mag === null) return '#cccccc'; // 未知震级
    if (mag < 3) return '#1890ff'; // 蓝色 - 微小
    if (mag < 5) return '#52c41a'; // 绿色 - 弱
    if (mag < 6) return '#faad14'; // 黄色 - 中等
    if (mag < 7) return '#fa8c16'; // 橙色 - 强
    return '#f5222d'; // 红色 - 大
  };

  // 获取震级半径 (可根据实际需求调整)
  const getMagnitudeRadius = (mag: number | null): number => {
     if (mag === null) return 5;
     return 5 + Math.pow(mag, 1.5); // 半径随震级指数增长
  };

  // --- 地图初始化和数据加载 ---
  // 初始化高德地图
  const initAMap = async () => {
    if (!mapContainerRef.current) {
        console.error("Map container ref is not available.");
        setError("地图容器加载失败");
        setMapLoading(false);
        return;
    }
    setMapLoading(true);
    setError(null);

    // 增加短暂延迟，确保容器渲染完成
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      console.log('开始加载高德地图 JS API...');
      const AMap = await AMapLoader.load({
        key: AMapKey,
        version: '2.0',
        plugins: ['AMap.Scale', 'AMap.ToolBar', 'AMap.InfoWindow'],
      });
      console.log('高德地图 JS API 加载成功');

      // 确保容器仍然存在
      if (!mapContainerRef.current) {
          console.error("地图容器在延迟后消失了");
          setError("地图容器加载异常");
          setMapLoading(false);
          return;
      }

      const map = new AMap.Map(mapContainerRef.current, {
        zoom: 5, // 初始缩放级别
        center: [104.195397, 35.86166], // 中国中心点
        viewMode: '2D', // 默认 2D
        // 尝试切换地图样式，例如卫星图
        // mapStyle: 'amap://styles/normal', // 标准地图样式
        mapStyle: 'amap://styles/satellite', // 尝试卫星图样式
      });

      // 添加地图加载完成事件监听
      map.on('complete', () => {
        console.log('高德地图加载完成 (complete event)');
        setMapLoading(false);
        // 地图加载完成后加载地震数据
        loadEarthquakeData();
      });

      // 添加控件
      map.addControl(new AMap.Scale());
      map.addControl(new AMap.ToolBar());

      // 创建信息窗体实例
      infoWindowRef.current = new AMap.InfoWindow({
          isCustom: true, // 使用自定义窗体
          autoMove: true,
          offset: new AMap.Pixel(0, -30), // 调整偏移量
      });

      mapInstanceRef.current = map;
      console.log('高德地图实例已创建，等待 complete 事件...');
      // 注意：移除这里的 setMapLoading(false) 和 loadEarthquakeData()，
      // 将它们移到 'complete' 事件回调中，确保地图完全准备好再加载数据

    } catch (e) {
      console.error('高德地图加载或初始化失败:', e);
      setError('高德地图加载失败，请检查网络或 API Key 配置（特别是域名白名单）。');
      message.error('高德地图加载失败，请检查 API Key 配置和网络');
      setMapLoading(false);
    }
  };

  // 加载 USGS 地震数据
  const loadEarthquakeData = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('开始从 USGS 获取地震数据...');
      const response = await fetch(USGS_API_URL);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: USGSData = await response.json();
      console.log(`成功获取 ${data.features.length} 条地震数据`);
      setEarthquakes(data.features);
      message.success(`成功加载 ${data.features.length} 条地震数据`);
    } catch (e) {
      console.error('获取 USGS 地震数据失败:', e);
      setError('获取地震数据失败，请检查网络连接或稍后重试。');
      message.error('获取地震数据失败');
    } finally {
      setLoading(false);
    }
  };

  // --- 更新地图标记 --- (修改函数签名以接收地震数据)
  const updateMapMarkers = (AMap: any, quakesToDisplay: USGSFeature[]) => {
      if (!mapInstanceRef.current || !AMap) {
          console.warn("地图实例或 AMap 对象未准备好，无法更新标记");
          return;
      }

      // 清除旧标记
      if (markersRef.current.length > 0) {
          console.log(`清除 ${markersRef.current.length} 个旧标记`);
          mapInstanceRef.current.remove(markersRef.current);
          markersRef.current = [];
      }

      console.log(`开始创建 ${quakesToDisplay.length} 个新标记 (基于筛选结果)`);
      const newMarkers: any[] = [];
      quakesToDisplay.forEach(quake => { // 使用传入的地震数据
          const { geometry, properties, id } = quake;
          if (!geometry || !geometry.coordinates) return;

          const [longitude, latitude] = geometry.coordinates;
          const mag = properties.mag;
          const color = getMagnitudeColor(mag);
          const radius = getMagnitudeRadius(mag);

          const markerContent = document.createElement('div');
          markerContent.className = styles.earthquakeMarker;
          markerContent.style.width = `${radius * 2}px`;
          markerContent.style.height = `${radius * 2}px`;
          markerContent.style.backgroundColor = color;
          markerContent.style.borderColor = 'rgba(255, 255, 255, 0.7)';

          const marker = new AMap.Marker({
              position: new AMap.LngLat(longitude, latitude),
              content: markerContent,
              offset: new AMap.Pixel(-radius, -radius),
              extData: quake,
              title: properties.title || '地震事件',
          });

          // 点击事件：显示信息窗体 (内容已在步骤 6 更新)
          marker.on('click', (e: any) => {
              const clickedQuake = e.target.getExtData() as USGSFeature;
              const clickPos = e.target.getPosition();
              const props = clickedQuake.properties;
              const coords = clickedQuake.geometry.coordinates;

              const infoContent = `
                  <div class="${styles.infoWindow}">
                      <h4>${props.title || '地震详情'}</h4>
                      <p><strong>时间:</strong> ${formatTime(props.time)}</p>
                      <p><strong>震级:</strong> ${props.mag?.toFixed(1) ?? '未知'} ${props.magType ? `(${props.magType})` : ''}</p>
                      <p><strong>深度:</strong> ${coords[2]?.toFixed(1) ?? '未知'} km</p>
                      <p><strong>位置:</strong> ${props.place || '未知'}</p>
                      <p><strong>状态:</strong> ${props.status || '未知'}</p>
                      <p><strong>海啸预警:</strong> ${props.tsunami === 1 ? '<span style="color: red; font-weight: bold;">是</span>' : '否'}</p>
                      ${props.url ? `<p><a href="${props.url}" target="_blank" rel="noopener noreferrer">查看 USGS 详情</a></p>` : ''}
                      ${props.detail ? `<p><a href="${props.detail}" target="_blank" rel="noopener noreferrer">详细数据 (GeoJSON)</a></p>` : ''}
                  </div>
              `;

              if (infoWindowRef.current) {
                  infoWindowRef.current.setContent(infoContent);
                  infoWindowRef.current.open(mapInstanceRef.current, clickPos);
              } else {
                  console.error("信息窗体实例未创建");
              }
          });

          newMarkers.push(marker);
      });

      // 将新标记添加到地图
      if (newMarkers.length > 0) {
          mapInstanceRef.current.add(newMarkers);
          markersRef.current = newMarkers;
          console.log(`成功添加 ${newMarkers.length} 个标记到地图 (筛选后)`);
      } else {
          console.log("筛选后无标记可添加");
      }
  };

  // --- 事件处理 ---
  const handleRefresh = () => {
    // 刷新时同时清除筛选条件，重新加载所有数据
    setMagnitudeRange([0, 10]);
    setTimeRange(null);
    loadEarthquakeData(); // 重新加载数据会触发后续的过滤和更新
  };

  // 震级滑块 onChange - 参数类型改为 number[]
  const handleMagnitudeChange = (value: number[]) => {
    // 确保是两个值
    if (value && value.length === 2) {
        console.log('震级范围筛选变更:', value);
        setMagnitudeRange([value[0], value[1]]);
    } else {
        console.warn('Slider 返回值异常:', value);
    }
  };

  // 时间范围选择器 onChange - 参数类型改为 Dayjs
  const handleTimeRangeChange = (
      dates: [Dayjs | null, Dayjs | null] | null,
      dateStrings: [string, string]
  ) => {
    console.log('时间范围筛选变更:', dateStrings);
    setTimeRange(dates);
  };

  // 禁用未来日期的函数 - 使用 dayjs
  const disabledDate: RangePickerProps['disabledDate'] = current => {
    return current && current > dayjs().endOf('day');
  };

  // --- 筛选和统计逻辑 ---
  const filteredEarthquakes = useMemo(() => {
    console.log('Recalculating filteredEarthquakes. Dependencies:', { earthquakes_count: earthquakes.length, magnitudeRange, timeRange });
    const [minMag, maxMag] = magnitudeRange;
    const [startTime, endTime] = timeRange ?? [null, null];

    // 将筛选时间转换为 UTC (如果存在)
    const startUtc = startTime ? startTime.utc() : null;
    const endUtc = endTime ? endTime.utc() : null;
    console.log('UTC Filter Times:', { startUtc: startUtc?.format(), endUtc: endUtc?.format() });

    const filtered = earthquakes.filter(quake => {
      const mag = quake.properties.mag;
      const time = quake.properties.time;

      // 震级筛选
      const magOk = mag === null || (mag >= minMag && mag <= maxMag);
      if (!magOk) return false;

      // 时间筛选 (使用 UTC 进行比较)
      let timeOk = true;
      if (time !== null) {
          // 将地震时间戳视为 UTC
          const quakeTimeUtc = dayjs.utc(time);

          if (startUtc && endUtc) {
              // 比较 UTC 时间
              timeOk = quakeTimeUtc.isSameOrAfter(startUtc) && quakeTimeUtc.isSameOrBefore(endUtc);
          } else if (startUtc) {
              timeOk = quakeTimeUtc.isSameOrAfter(startUtc);
          } else if (endUtc) {
              timeOk = quakeTimeUtc.isSameOrBefore(endUtc);
          }
          // 调试日志: 打印比较结果
          // if (startUtc || endUtc) {
          //     console.log(`Quake Time (UTC): ${quakeTimeUtc.format()}, Start (UTC): ${startUtc?.format()}, End (UTC): ${endUtc?.format()}, timeOk: ${timeOk}`);
          // }
      }
      if (!timeOk) return false;

      return true;
    });
    console.log(`Filtering done. ${filtered.length} earthquakes passed.`);
    return filtered;
  }, [earthquakes, magnitudeRange, timeRange]);

  // 计算统计数据 - useEffect (保持不变, 已依赖 filteredEarthquakes)
  useEffect(() => {
    console.log('Calculating stats for filtered earthquakes:', filteredEarthquakes.length);
    const newStats = calculateStats(filteredEarthquakes);
    setStats(newStats);
  }, [filteredEarthquakes]);

  // --- 地图标记更新 - 调用修改后的 updateMapMarkers ---
  useEffect(() => {
    if (window.AMap && mapInstanceRef.current) { // 增加 mapInstanceRef.current 的检查
       console.log('Updating markers with filtered earthquakes:', filteredEarthquakes.length);
       updateMapMarkers(window.AMap, filteredEarthquakes); // 使用过滤后的数据
    } else {
       console.warn("AMap or Map Instance not ready yet for marker update based on filters.");
    }
  }, [filteredEarthquakes]); // 依赖过滤后的数据

  // --- Effect Hooks ---
  // 加载地图
  useEffect(() => {
    initAMap();
    // 组件卸载时销毁地图
    return () => {
      if (mapInstanceRef.current) {
        console.log('销毁高德地图实例');
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, []); // 空依赖数组，仅在挂载时执行一次

  // 当地震数据更新时，更新地图标记
  useEffect(() => {
    // 检查 AMap 是否已加载在 window 对象上
    if (mapInstanceRef.current && window.AMap && earthquakes.length > 0) {
      console.log('地震数据已更新，准备更新地图标记...');
      updateMapMarkers(window.AMap, earthquakes);
    } else if (mapInstanceRef.current && window.AMap && earthquakes.length === 0 && !loading) {
        // 如果没有地震数据，也清空标记
        console.log('没有地震数据，清空地图标记...');
        updateMapMarkers(window.AMap, []);
    }
  }, [earthquakes, mapLoading]); // 依赖地震数据和地图加载状态

  return (
    <PageContainer
      header={{
        title: '实时地震活动地图',
      }}
      extra={[
        <Button key="refresh" icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>
          刷新数据
        </Button>,
      ]}
    >
      {error && <Alert message="错误" description={error} type="error" closable showIcon style={{ marginBottom: 16 }} />}

      <Row gutter={16}> {/* 使用 Row 包裹，设置间距 */}
        {/* 地图区域 */}
        <Col xs={24} sm={24} md={18} lg={18} xl={18}> {/* 响应式布局 */}
          <Spin spinning={mapLoading || loading} tip="地图和数据加载中...">
             {/* Card 包裹地图容器 */}
            <Card bordered={false} bodyStyle={{ padding: 0 }}>
                 <div ref={mapContainerRef} className={styles.mapContainer} />
             </Card>
          </Spin>
        </Col>

        {/* 信息面板区域 */}
        <Col xs={24} sm={24} md={6} lg={6} xl={6}> {/* 响应式布局 */}
          <div className={styles.infoPanel}>
            {/* 图例 Card */}
            <Card title={<Title level={5}>图例</Title>} size="small" style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8 }}>
                 <Text strong>震级与颜色:</Text>
              </div>
              {legendMagnitudeLevels.map(level => (
                <div key={level.range} className={styles.legendItem}>
                  <span
                    className={styles.legendColorBox}
                    style={{ backgroundColor: getMagnitudeColor(level.mag) }}
                  />
                  <Text>{level.label}</Text>
                </div>
              ))}
            </Card>

            {/* 筛选 Card */}
            <Card title={<Title level={5}>筛选条件</Title>} size="small" style={{ marginBottom: 16 }}>
               {/* 震级筛选 */}
              <div style={{ marginBottom: 16 }}>
                  <Text strong>震级范围:</Text>
                  <Slider
                      range
                      min={0}
                      max={10}
                      step={0.1}
                      value={magnitudeRange}
                      onChange={handleMagnitudeChange} // 函数签名已修正
                      marks={{
                          0: '0', 2: '2', 4: '4', 6: '6', 8: '8', 10: '10'
                      }}
                      tipFormatter={(value) => `${value} 级`}
                  />
                  <Text type="secondary" style={{ fontSize: 12, textAlign: 'center', display: 'block' }}>
                      当前选择: M {magnitudeRange[0].toFixed(1)} - {magnitudeRange[1].toFixed(1)}
                  </Text>
              </div>

              <Divider style={{ margin: '12px 0' }}/>

               {/* 时间筛选 */}
              <div>
                  <Text strong>时间范围:</Text>
                  <RangePicker
                      style={{ width: '100%', marginTop: 4 }}
                      value={timeRange} // 类型已修正为 Dayjs
                      onChange={handleTimeRangeChange} // 函数签名已修正
                      disabledDate={disabledDate} // 函数已修正
                      showTime
                      format="YYYY-MM-DD HH:mm"
                      placeholder={['开始时间', '结束时间']}
                      allowClear
                  />
              </div>
            </Card>

            {/* 统计 Card */}
            <Card title={<Title level={5}>统计概要</Title>} size="small" style={{ marginBottom: 16 }}>
              {stats ? (
                <Row gutter={[8, 8]}> {/* 使用 Row 和 Col 进行布局 */}
                   <Col span={12}>
                      <Statistic title="总数量" value={stats.totalCount} />
                   </Col>
                   <Col span={12}>
                      <Statistic title="平均震级" value={stats.avgMagnitude?.toFixed(1) ?? 'N/A'} />
                   </Col>
                   <Col span={12}>
                      <Statistic title="最大震级" value={stats.maxMagnitude?.toFixed(1) ?? 'N/A'} />
                   </Col>
                   <Col span={12}>
                      <Statistic title="最小震级" value={stats.minMagnitude?.toFixed(1) ?? 'N/A'} />
                   </Col>
                   <Col span={24}><Divider style={{ margin: '8px 0' }} /></Col>
                   <Col span={24}><Text strong>按震级分布:</Text></Col>
                   {/* 遍历 legendMagnitudeLevels 来保证顺序和标签一致性 */}
                   {legendMagnitudeLevels.map(level => (
                       <Col span={12} key={`stat-${level.range}`}>
                            <Text type="secondary" style={{ fontSize: 12 }}>{level.label}:</Text>
                       </Col>
                   ))}
                   {legendMagnitudeLevels.map(level => (
                       <Col span={12} key={`stat-val-${level.range}`} style={{ textAlign: 'right' }}>
                            <Text strong>{stats.countByMagnitude[level.range] ?? 0}</Text>
                       </Col>
                   ))}
                </Row>
              ) : (
                <Text type="secondary">暂无统计数据</Text>
              )}
            </Card>

          </div>
        </Col>
      </Row>
    </PageContainer>
  );
};

export default RealtimeEarthquakeMap; 