import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PageContainer } from '@ant-design/pro-layout';
import { Card, Table, Spin, Typography, Alert, Tag } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

const { Title, Text, Paragraph } = Typography;

// --- 地震事件接口 (保持不变) ---
interface EarthquakeEvent {
    id: string;
    latitude: number;
    longitude: number;
    depth: number;
    magnitude: number;
    originTime: Dayjs;
    place?: string;
}

// --- 监测点接口 ---
interface MonitoringLocation {
    key: string;
    name: string;
    latitude: number;
    longitude: number;
}

// --- 到达信息接口 ---
interface ArrivalInfo {
    key: string;
    locationName: string;
    distance: number | null;
    pWaveTravelTime: number | null;
    sWaveTravelTime: number | null;
    pWaveArrivalTime: Dayjs | null;
    sWaveArrivalTime: Dayjs | null;
    psTimeDiff: number | null;
}

// --- 常量 (移除地图和模拟相关) ---
const AVG_P_WAVE_VELOCITY_KM_S = 6.5;
const AVG_S_WAVE_VELOCITY_KM_S = 3.8;

// --- 示例地震事件 (保持不变) ---
const exampleEarthquake: EarthquakeEvent = {
    id: 'example-quake',
    latitude: 39.9042,
    longitude: 116.4074,
    depth: 10,
    magnitude: 5.0,
    originTime: dayjs().subtract(10, 'minute'), // 将示例时间设为10分钟前，使计算结果更有意义
    place: '示例震中 (北京附近)',
};

// --- 预定义监测点列表 ---
const monitoringLocations: MonitoringLocation[] = [
    { key: 'shanghai', name: '上海', latitude: 31.2304, longitude: 121.4737 },
    { key: 'guangzhou', name: '广州', latitude: 23.1291, longitude: 113.2644 },
    { key: 'chengdu', name: '成都', latitude: 30.5728, longitude: 104.0668 },
    { key: 'tianjin', name: '天津', latitude: 39.0842, longitude: 117.2010 },
    { key: 'tokyo', name: '东京', latitude: 35.6895, longitude: 139.6917 },
    { key: 'seoul', name: '首尔', latitude: 37.5665, longitude: 126.9780 },
];

// --- 组件主体 ---
const WaveArrivalDisplay: React.FC = () => { // 重命名组件函数
    const [loading, setLoading] = useState<boolean>(false); // 只保留计算 Loading
    const [error, setError] = useState<string | null>(null); // 保留错误状态
    const [selectedEarthquake, setSelectedEarthquake] = useState<EarthquakeEvent>(exampleEarthquake);
    const [arrivalData, setArrivalData] = useState<ArrivalInfo[]>([]); // 存储计算结果

    // --- 辅助函数：计算距离 (保持不变) ---
    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        return distance;
    };

    // --- 计算到达时间逻辑 ---
    useEffect(() => {
        if (!selectedEarthquake) {
            setArrivalData([]);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const calculatedData: ArrivalInfo[] = monitoringLocations.map(location => {
                const distance = calculateDistance(
                    selectedEarthquake.latitude,
                    selectedEarthquake.longitude,
                    location.latitude,
                    location.longitude
                );

                const pTravelTime = distance / AVG_P_WAVE_VELOCITY_KM_S;
                const sTravelTime = distance / AVG_S_WAVE_VELOCITY_KM_S;

                const pArrivalTime = selectedEarthquake.originTime.add(pTravelTime, 'second');
                const sArrivalTime = selectedEarthquake.originTime.add(sTravelTime, 'second');

                const psDiff = sTravelTime - pTravelTime;

                return {
                    key: location.key,
                    locationName: location.name,
                    distance: distance,
                    pWaveTravelTime: pTravelTime,
                    sWaveTravelTime: sTravelTime,
                    pWaveArrivalTime: pArrivalTime,
                    sWaveArrivalTime: sArrivalTime,
                    psTimeDiff: psDiff,
                };
            });
            setArrivalData(calculatedData);
        } catch (err: any) {            setError(`计算到达时间时出错: ${err.message}`);
            setArrivalData([]);
        } finally {
            setLoading(false);
        }
    }, [selectedEarthquake]); // 当地震事件变化时重新计算

    // --- 表格列定义 ---
    const columns = [
        {
            title: '监测点',
            dataIndex: 'locationName',
            key: 'locationName',
        },
        {
            title: '距离 (km)',
            dataIndex: 'distance',
            key: 'distance',
            render: (dist: number | null) => dist !== null ? dist.toFixed(1) : '-',
        },
        {
            title: 'P波到达时间',
            dataIndex: 'pWaveArrivalTime',
            key: 'pWaveArrivalTime',
            render: (time: Dayjs | null) => time ? time.format('YYYY-MM-DD HH:mm:ss') : '-',
        },
        {
            title: 'S波到达时间',
            dataIndex: 'sWaveArrivalTime',
            key: 'sWaveArrivalTime',
            render: (time: Dayjs | null) => time ? time.format('YYYY-MM-DD HH:mm:ss') : '-',
        },
        {
            title: 'P-S 时间差 (秒)',
            dataIndex: 'psTimeDiff',
            key: 'psTimeDiff',
            render: (diff: number | null) => diff !== null ? diff.toFixed(1) : '-',
        },
    ];

    return (
        <PageContainer header={{ title: '地震波到达' }}>
            {error && <Alert message="错误" description={error} type="error" showIcon style={{ marginBottom: 16 }} />}
            <Card style={{ marginBottom: 16 }}>
                <Title level={4}>地震事件信息 (示例)</Title>
                <Paragraph>
                    <Text strong>地点: </Text><Text>{selectedEarthquake.place || '未知'}</Text> <br />
                    <Text strong>时间: </Text><Text>{selectedEarthquake.originTime.format('YYYY-MM-DD HH:mm:ss')}</Text> <br />
                    <Text strong>经度: </Text><Text>{selectedEarthquake.longitude.toFixed(4)}</Text> | <Text strong>纬度: </Text><Text>{selectedEarthquake.latitude.toFixed(4)}</Text> <br />
                    <Text strong>震级: </Text><Tag color="volcano">M {selectedEarthquake.magnitude.toFixed(1)}</Tag> | <Text strong>深度: </Text><Text>{selectedEarthquake.depth} km</Text>
                </Paragraph>
            </Card>

            <Card>
                <Title level={4}>主要监测点预计到达时间</Title>
                <Spin spinning={loading}>
                    <Table
                        columns={columns}
                        dataSource={arrivalData}
                        pagination={false} // 数据量不大，禁用分页
                        size="small"
                    />
                </Spin>
            </Card>
        </PageContainer>
    );
};

export default WaveArrivalDisplay; // 更新导出名称 