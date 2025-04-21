import { PlusOutlined } from '@ant-design/icons';
import type { ActionType, ProColumns, ProDescriptionsItemProps } from '@ant-design/pro-components';
import {
  PageContainer,
  ProTable,
} from '@ant-design/pro-components';
import { FormattedMessage, useIntl } from '@umijs/max';
import { Button, message, Form, DatePicker, InputNumber, Space, Card, Input, Typography } from 'antd';
import React, { useRef, useState } from 'react';
import dayjs from 'dayjs';

// --- USGS Event API Data Structures ---
interface USGSEventProperties {
  mag: number | null;
  place: string | null;
  time: number | null;
  updated: number | null;
  tz: number | null; // Deprecated, use 'time' instead
  url: string | null;
  detail: string | null; // URL to GeoJSON detail
  felt: number | null;
  cdi: number | null;
  mmi: number | null;
  alert: string | null;
  status: string | null;
  tsunami: number | null;
  sig: number | null;
  net: string | null;
  code: string | null;
  ids: string | null;
  sources: string | null;
  types: string | null;
  nst: number | null;
  dmin: number | null;
  rms: number | null;
  gap: number | null;
  magType: string | null;
  type: string | null; // e.g., 'earthquake'
  title: string | null;
}

interface USGSEventGeometry {
  type: 'Point';
  coordinates: [number, number, number]; // longitude, latitude, depth(km)
}

interface USGSEventFeature {
  type: 'Feature';
  properties: USGSEventProperties;
  geometry: USGSEventGeometry;
  id: string;
}

// --- 简单的、硬编码的地名翻译映射 (仅供演示，覆盖范围极小) ---
const locationTranslationMap: Record<string, string> = {
    // 与 Welcome.tsx 保持一致
    'Ascension Island': '阿森松岛',
    'Philippines': '菲律宾',
    'China': '中国',
    'South Indian Ocean': '南印度洋',
    'Guam': '关岛',
    // 添加 TableList 示例中的地名
    'Nevada': '内华达州',
    'Alaska': '阿拉斯加州',
    'CA': '加利福尼亚州', // 通常 CA 代表加州
    // 可以继续添加更多简单的映射...
};

// --- 尝试翻译地名的简单函数 ---
const translateLocation = (place: string | null): string => {
    if (!place) return '未知地点';
    let translatedPlace = place;
    // 尝试替换已知片段 (忽略大小写进行匹配和替换)
    for (const key in locationTranslationMap) {
        // 使用正则表达式进行全局、不区分大小写的替换
        const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        translatedPlace = translatedPlace.replace(regex, locationTranslationMap[key]);
    }
    return translatedPlace;
};

// --- API Fetch Function ---
const fetchHistoricalEarthquakes = async (
  params: { pageSize?: number; current?: number } & Record<string, any>,
  filterValues: Record<string, any>
) => {
  const { pageSize = 10, current = 1, ...restParams } = params; // ProTable 的分页和排序参数
  const apiParams = new URLSearchParams();

  apiParams.set('format', 'geojson');

  // 处理日期范围
  const startTime = filterValues.startTime;
  const endTime = filterValues.endTime;

  if (startTime && dayjs.isDayjs(startTime)) {
      if (endTime && dayjs.isDayjs(endTime)) {
          // 校验：开始时间不能晚于结束时间
          if (startTime.isAfter(endTime)) {
              message.error('开始时间不能晚于结束时间');
              return { data: [], success: false, total: 0 }; // 阻止无效请求
          }
          apiParams.set('endtime', endTime.format('YYYY-MM-DDTHH:mm:ss'));
      }
      apiParams.set('starttime', startTime.format('YYYY-MM-DDTHH:mm:ss'));
  } else if (endTime && dayjs.isDayjs(endTime)) {
      // 只有结束时间的情况
      apiParams.set('endtime', endTime.format('YYYY-MM-DDTHH:mm:ss'));
  }

  // 处理震级
  if (filterValues.minMagnitude !== undefined && filterValues.minMagnitude !== null) {
    apiParams.set('minmagnitude', filterValues.minMagnitude.toString());
  }
  if (filterValues.maxMagnitude !== undefined && filterValues.maxMagnitude !== null) {
    apiParams.set('maxmagnitude', filterValues.maxMagnitude.toString());
  }

  // 映射分页, 设置最大 limit
  // ++ 简化测试：固定 limit，移除 offset
  apiParams.set('limit', '20');
  // apiParams.set('offset', offset.toString()); // 暂时移除 offset

  // 映射排序 (ProTable 的 sort 参数格式为 { field: 'ascend' | 'descend' })
  // USGS API 使用 orderby=time 或 orderby=time-asc, orderby=magnitude 或 orderby=magnitude-asc
  // ++ 简化测试：移除 orderby
  // let orderBy = 'time'; // 默认按时间降序
  // ... (排序逻辑注释掉)
  // apiParams.set('orderby', orderBy);

  const apiUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?${apiParams.toString()}`;
  console.log('Fetching USGS Data (Simplified):', apiUrl); // 更新日志信息

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // 检查返回的数据结构是否符合预期
    if (data && data.features && Array.isArray(data.features)) {
        // 注意：这里的 total 使用返回的 features 长度，因为 API 不直接提供总数
        return {
            data: data.features as USGSEventFeature[],
            success: true,
            total: data.features.length, // 限制了查询，所以这个 total 可能不准确
        };
    } else {
        console.error('Unexpected API response format:', data);
        message.error('获取地震数据格式错误');
        return { data: [], success: false, total: 0 };
    }
  } catch (error: any) {
    console.error('Failed to fetch historical earthquakes:', error);
    message.error(`加载历史地震数据失败: ${error.message}`);
    return { data: [], success: false, total: 0 };
  }
};

const TableList: React.FC = () => {
  const actionRef = useRef<ActionType>();

  /**
   * @en-US International configuration
   * @zh-CN 国际化配置
   * */
  const intl = useIntl();

  const [filterValues, setFilterValues] = useState<Record<string, any>>({});
  const [form] = Form.useForm();

  const columns: ProColumns<USGSEventFeature>[] = [
    {
      title: '发震时刻',
      dataIndex: ['properties', 'time'], // 访问嵌套属性
      valueType: 'dateTime',
      sorter: true,
      key: 'time', // 添加 key 用于排序映射
      render: (_, record) => {
        const time = record.properties.time;
        return time ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : '-';
      },
      // 可以在 ProTable 的 search schema 中定义，但这里使用外部筛选器
      // hideInSearch: true,
    },
    {
      title: '地点',
      key: 'place',
      ellipsis: true,
      width: 350, // 可能需要更宽以容纳部分翻译后的文本
      render: (_, record) => {
          const originalPlace = record.properties.place;
          const translatedPlace = translateLocation(originalPlace);
          // 返回翻译后的地点，如果翻译结果与原文本不同，可以考虑添加提示或保留原文本
          return (
              <span title={originalPlace ?? ''}> {/* 鼠标悬浮显示原文 */} 
                  {translatedPlace}
              </span>
          );
      }
    },
    {
      title: '震级 (M)',
      dataIndex: ['properties', 'mag'],
      key: 'mag',
      sorter: true,
      align: 'right',
      render: (_, record) => {
          const mag = record.properties.mag;
          return mag !== null ? mag.toFixed(1) : 'N/A';
      },
    },
    {
        title: '深度 (km)',
        dataIndex: ['geometry', 'coordinates', 2], // 深度是坐标数组的第三个元素
        key: 'depth',
        sorter: false, // API 可能不支持按深度排序
        align: 'right',
        renderText: (val: number) => (val !== null && val !== undefined ? val.toFixed(1) : '-'),
    },
    {
      title: '操作',
      dataIndex: 'id', // 使用 id 作为 dataIndex (不直接显示)
      valueType: 'option',
      key: 'option',
      render: (_, record) => {
        const url = record.properties.url;
        const linkElement = url ? (
          <a
            key="detail-link"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            USGS 详情
          </a>
        ) : (
          <Typography.Text key="detail-link-disabled" disabled>
            USGS 详情
          </Typography.Text>
        );
        return [
          linkElement,
          // 可以添加其他操作
        ];
      },
    },
  ];

  return (
    <PageContainer>
      <Card style={{ marginBottom: 16 }}>
        <Form
          form={form}
          layout="inline"
          onFinish={(values: any) => {
            console.log('Filter values:', values);
            // 直接使用表单的值，日期范围保持为 Dayjs 对象数组
            const newFilterValues: Record<string, any> = {};
            if (values.dateRange && values.dateRange.length === 2) {
                newFilterValues.startTime = values.dateRange[0]; // 保留 Dayjs 对象
                newFilterValues.endTime = values.dateRange[1];   // 保留 Dayjs 对象
            } else {
                newFilterValues.startTime = null;
                newFilterValues.endTime = null;
            }
            newFilterValues.minMagnitude = values.minMagnitude;
            newFilterValues.maxMagnitude = values.maxMagnitude;

            setFilterValues(newFilterValues);
            // 清除 ProTable 内部的搜索条件，避免冲突
            actionRef.current?.setPageInfo?.({ current: 1 }); // 重置页码
            actionRef.current?.reload(); // 触发表格重新请求
          }}
        >
          <Form.Item name="dateRange" label="日期范围">
            <DatePicker.RangePicker />
          </Form.Item>
          <Form.Item name="minMagnitude" label="最小震级">
            <InputNumber min={0} max={10} step={0.1} style={{ width: '100px' }} placeholder="例如 4.5" />
          </Form.Item>
          <Form.Item name="maxMagnitude" label="最大震级">
            <InputNumber min={0} max={10} step={0.1} style={{ width: '100px' }} placeholder="例如 6.0" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                查询
              </Button>
              <Button
                onClick={() => {
                  form.resetFields();
                  setFilterValues({});
                  actionRef.current?.setPageInfo?.({ current: 1 });
                  actionRef.current?.reload();
                }}
              >
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <ProTable<USGSEventFeature, { pageSize?: number; current?: number } & Record<string, any>>
        headerTitle="历史地震事件查询 (USGS)"
        actionRef={actionRef}
        rowKey="id"
        search={false}
        request={async (params, sort, filter) => {
          return fetchHistoricalEarthquakes({ ...params, ...sort }, filterValues);
        }}
        columns={columns}
      />
    </PageContainer>
  );
};

export default TableList;
