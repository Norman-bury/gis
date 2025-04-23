import { PageContainer, ProCard } from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import { Card, theme, Spin, Alert, Row, Col, Statistic, List, Typography, Divider, message } from 'antd';
import React, { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { Link } from '@umijs/max';
import { Pie, Column } from '@ant-design/charts';

const { Text, Title } = Typography;

interface USGSFeatureProperties {
    mag: number | null;
    place: string | null;
    time: number | null;
    url: string | null;
    title: string;
}
interface USGSFeature {
    properties: USGSFeatureProperties;
    id: string;
    geometry?: {
        type: 'Point';
        coordinates: [number, number, number];
    };
}
interface USGSMetadata {
    generated: number;
    url: string;
    title: string;
    status: number;
    api: string;
    count: number;
}
interface USGSData {
    type: 'FeatureCollection';
    metadata: USGSMetadata;
    features: USGSFeature[];
    bbox?: [number, number, number, number, number, number];
}
interface EarthquakeStats {
    totalCount: number;
    maxMagnitude: number | null;
    countM5Plus?: number;
    countM6Plus?: number;
    lastUpdated?: number | null;
    dataSourceTitle?: string;
}

// USGS API Endpoints
const USGS_PAST_DAY_M25_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';

// 统计计算函数 (可以进一步扩展)
const calculateDashboardStats = (dayData: USGSData): EarthquakeStats => {
    let maxMag: number | null = null;
    let countM5 = 0;
    let countM6 = 0;

    dayData.features.forEach((quake: USGSFeature) => {
        const mag = quake.properties.mag;
        if (mag !== null) {
            if (maxMag === null || mag > maxMag) {
                maxMag = mag;
            }
            if (mag >= 5) countM5++;
            if (mag >= 6) countM6++;
        }
    });

    return {
        totalCount: dayData.metadata.count ?? dayData.features.length,
        maxMagnitude: maxMag,
        countM5Plus: countM5,
        countM6Plus: countM6,
        lastUpdated: dayData.metadata.generated,
        dataSourceTitle: dayData.metadata.title,
    };
};

const formatTime = (timestamp: number | null): string => {
    if (!timestamp) return '未知时间';
    return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss');
};

// --- 简单的、硬编码的地名翻译映射 (仅供演示，覆盖范围极小) ---
const locationTranslationMap: Record<string, string> = {
  'Ascension Island': '阿森松岛',
  'Philippines': '菲律宾',
  'China': '中国',
  'South Indian Ocean': '南印度洋',
  'Guam': '关岛',
  // 可以继续添加更多简单的映射...
};

// --- 尝试翻译地名的简单函数 ---
const translateLocation = (place: string | null): string => {
  if (!place) return '未知地点';
  let translatedPlace = place;
  // 尝试替换已知片段
  for (const key in locationTranslationMap) {
      // 使用正则表达式进行全局替换，避免只替换第一个匹配项
      // 注意：这仍然是一个非常基础的替换，可能不准确
      const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'); // 转义正则特殊字符
      translatedPlace = translatedPlace.replace(regex, locationTranslationMap[key]);
  }
  return translatedPlace;
};

// --- 移除静态饼图数据 ---
/*
const magnitudePieData = [
  { type: 'M 2.5-4', value: 275 },
  { type: 'M 4-5', value: 110 },
  { type: 'M 5-6', value: 35 },
  { type: 'M 6+', value: 8 },
  { type: '未知', value: 15 },
];
*/

// +++ 保留柱状图静态数据 +++
const dailyCountData = [
  { date: '昨天 -2', count: 98 },
  { date: '昨天 -1', count: 115 },
  { date: '昨天', count: 130 },
  { date: '今天', count: 105 }, 
];

const WelcomeDashboard: React.FC = () => {
  const { token } = theme.useToken();
  const { initialState } = useModel('@@initialState');

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<EarthquakeStats | null>(null);
  // +++ 恢复状态 +++
  const [magnitudeDistribution, setMagnitudeDistribution] = useState<Record<string, number> | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    setMagnitudeDistribution(null); // 重置
    try {
      console.log('Fetching dashboard data (daily summary)...');
      const dayResponse = await fetch(USGS_PAST_DAY_M25_URL);

      if (!dayResponse.ok) {
        throw new Error(`获取日数据失败: ${dayResponse.status}`);
      }

      const dayData: USGSData = await dayResponse.json();
      console.log('Daily data fetched successfully:', { dayCount: dayData.features.length });

      // 1. 计算统计数据
      const calculatedStats = calculateDashboardStats(dayData);
      setStats(calculatedStats);

      // +++ 恢复计算震级分布 +++
      const dist: Record<string, number> = {
          'M 2.5-4': 0, // 使用与之前静态数据一致的key
          'M 4-5': 0,
          'M 5-6': 0,
          'M 6+': 0, 
          '未知': 0,
      };
      let unknownCount = 0;
      dayData.features.forEach((q: USGSFeature) => {
          const mag = q.properties.mag;
          if (mag === null) {
              unknownCount++;
          } else if (mag < 4) {
              dist['M 2.5-4']++;
          } else if (mag < 5) {
              dist['M 4-5']++;
          } else if (mag < 6) {
              dist['M 5-6']++;
          } else { // mag >= 6
              dist['M 6+']++;
          }
      });
      if (unknownCount > 0) {
          dist['未知'] = unknownCount;
      }
      // 过滤掉数量为0的项，避免饼图显示0%
      const filteredDist = Object.fromEntries(
        Object.entries(dist).filter(([_, value]) => value > 0)
      );
      setMagnitudeDistribution(filteredDist);

      message.success('仪表盘概要数据已更新');

    } catch (e: any) {
      console.error('加载仪表盘数据出错:', e);
      setError(`加载数据时发生错误: ${e.message}`);
      message.error('加载仪表盘数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // +++ 动态计算饼图数据 +++
  const dynamicMagnitudePieData = magnitudeDistribution
    ? Object.entries(magnitudeDistribution).map(([type, value]) => ({ type, value }))
    : [];

  // +++ 图表配置 +++
  const magnitudePieConfig = {
    appendPadding: 10,
    data: dynamicMagnitudePieData, // 使用动态数据
    angleField: 'value',
    colorField: 'type',
    radius: 0.8,
    autoFit: true, // 添加 autoFit
    label: {
      type: 'inner',
      offset: '-30%',
      content: ({ percent }: any) => `${(percent * 100).toFixed(0)}%`,
      style: {
        fontSize: 14,
        textAlign: 'center',
      },
    },
    interactions: [{ type: 'element-active' }],
    tooltip: {
      formatter: (datum: any) => {
        return { name: datum.type, value: `${datum.value} 次` };
      },
    },
  };

  const dailyCountConfig = {
    data: dailyCountData, // 保持静态数据
    xField: 'date',
    yField: 'count',
    autoFit: true, // 添加 autoFit
    label: {
      position: 'middle' as const, 
      style: {
        fill: '#FFFFFF',
        opacity: 0.6,
      },
    },
    xAxis: {
      label: { autoHide: true, autoRotate: false },
    },
    meta: {
      date: { alias: '日期' },
      count: { alias: '地震数量' },
    },
    tooltip: {
        formatter: (datum: any) => {
          return { name: datum.date, value: `${datum.count} 次` };
        },
    },
  };

  return (
    <PageContainer header={{ title: '地震概览仪表盘' }}>
      <Spin spinning={loading} tip="加载仪表盘数据中...">
        {error && <Alert message="加载数据出错" description={error} type="error" showIcon style={{ marginBottom: 16 }} />}
        <Row gutter={[16, 16]}>
            <Col span={24}>
                <ProCard
                    title="过去 24 小时概要 (M2.5+)"
                    bordered
                    headerBordered
                    extra={stats?.lastUpdated ? `数据更新于: ${formatTime(stats.lastUpdated)}` : ''}
                >
                    {stats ? (
                        <Row gutter={16}>
                            <Col xs={12} sm={8} md={6} lg={4}>
                                <Statistic title="地震总数" value={stats.totalCount} />
                            </Col>
                            <Col xs={12} sm={8} md={6} lg={4}>
                                <Statistic title="最大震级" value={stats.maxMagnitude?.toFixed(1) ?? 'N/A'} />
                            </Col>
                            <Col xs={12} sm={8} md={6} lg={4}>
                                <Statistic title="M5+ 地震" value={stats.countM5Plus ?? 0} />
                            </Col>
                            <Col xs={12} sm={8} md={6} lg={4}>
                                <Statistic title="M6+ 地震" value={stats.countM6Plus ?? 0} />
                            </Col>
                        </Row>
                    ) : (
                        <Text type="secondary">暂无统计数据</Text>
                    )}
                </ProCard>
            </Col>
            <Col xs={24} md={12} lg={8}>
                <Card title="震级分布 (过去24小时 M2.5+)" bordered={false}>
                   <Spin spinning={loading || !magnitudeDistribution} tip="加载分布数据中...">
                    <div style={{ width: '100%', height: 'calc(400px - 70px)' }}> 
                      {dynamicMagnitudePieData.length > 0 ? (
                           <Pie {...magnitudePieConfig} height={330} /> 
                      ) : (
                          !loading && <Text type="secondary">暂无分布数据</Text>
                      )}
                    </div>
                   </Spin>
                </Card>
            </Col>
            <Col xs={24} md={12} lg={16}>
                <Card title="每日地震数量 (静态数据)" bordered={false}>
                   <Spin spinning={loading} tip="加载图表中..."> 
                     <div style={{ width: '100%', height: 'calc(400px - 70px)' }}>
                       <Column {...dailyCountConfig} height={330} />
                     </div>
                   </Spin>
                </Card>
            </Col>
        </Row>
      </Spin>
    </PageContainer>
  );
};

export default WelcomeDashboard;
