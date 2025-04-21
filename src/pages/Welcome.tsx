import { PageContainer, ProCard } from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import { Card, theme, Spin, Alert, Row, Col, Statistic, List, Typography, Divider, message } from 'antd';
import React, { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { Link } from '@umijs/max';

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
const USGS_PAST_WEEK_M45_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson';

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

const WelcomeDashboard: React.FC = () => {
  const { token } = theme.useToken();
  const { initialState } = useModel('@@initialState');

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<EarthquakeStats | null>(null);
  const [recentQuakes, setRecentQuakes] = useState<USGSFeature[]>([]);
  const [magnitudeDistribution, setMagnitudeDistribution] = useState<Record<string, number> | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('Fetching dashboard data...');
      // 并行获取两份数据
      const [dayResponse, weekResponse] = await Promise.all([
        fetch(USGS_PAST_DAY_M25_URL),
        fetch(USGS_PAST_WEEK_M45_URL),
      ]);

      if (!dayResponse.ok || !weekResponse.ok) {
        let errorMsg = '';
        if (!dayResponse.ok) errorMsg += `获取日数据失败: ${dayResponse.status}; `;
        if (!weekResponse.ok) errorMsg += `获取周数据失败: ${weekResponse.status}; `;
        throw new Error(errorMsg);
      }

      const dayData: USGSData = await dayResponse.json();
      const weekData: USGSData = await weekResponse.json();
      console.log('Data fetched successfully:', { dayCount: dayData.features.length, weekCount: weekData.features.length });

      // 1. 计算统计数据
      const calculatedStats = calculateDashboardStats(dayData);
      setStats(calculatedStats);

      // 2. 设置近期强震列表 (M4.5+)
      // USGS week feed 已经筛选了 M4.5+，直接使用
      setRecentQuakes(weekData.features);

      // 3. 计算震级分布 (基于日数据 M2.5+)
      const dist: Record<string, number> = {
          '2.5-4': 0,
          '4-5': 0,
          '5-6': 0,
          '6-7': 0,
          '>= 7': 0,
          '未知': 0,
      };
      let unknownCount = 0;
      dayData.features.forEach((q: USGSFeature) => {
          const mag = q.properties.mag;
          if (mag === null) {
              unknownCount++;
          } else if (mag < 4) {
              dist['2.5-4']++;
          } else if (mag < 5) {
              dist['4-5']++;
          } else if (mag < 6) {
              dist['5-6']++;
          } else if (mag < 7) {
              dist['6-7']++;
          } else {
              dist['>= 7']++;
          }
      });
      if (unknownCount > 0) {
          dist['未知'] = unknownCount;
      }
      setMagnitudeDistribution(dist);

      message.success('仪表盘数据已更新');

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
                            {/* 可以根据需要添加更多统计项 */}
                        </Row>
                    ) : (
                        <Text type="secondary">暂无统计数据</Text>
                    )}
                </ProCard>
            </Col>
            <Col span={24}>
                <ProCard title="近期强震 (过去7天 M4.5+)" bordered headerBordered style={{ minHeight: '300px' }}>
                    <List
                        itemLayout="horizontal"
                        dataSource={recentQuakes}
                        renderItem={(item: USGSFeature) => (
                            <List.Item>
                                <List.Item.Meta
                                    title={<a href={item.properties.url ?? '#'} target="_blank" rel="noopener noreferrer">{`M ${item.properties.mag?.toFixed(1) ?? '?'} - 地点: ${translateLocation(item.properties.place)}`}</a>}
                                    description={formatTime(item.properties.time)}
                                />
                            </List.Item>
                        )}
                        pagination={{
                            pageSize: 5,
                            size: 'small',
                            hideOnSinglePage: true,
                        }}
                        locale={{ emptyText: '暂无 M4.5+ 地震数据' }}
                        loading={loading}
                    />
                </ProCard>
            </Col>
        </Row>
      </Spin>
    </PageContainer>
  );
};

export default WelcomeDashboard;
