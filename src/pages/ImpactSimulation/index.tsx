import React, { useState, useEffect, useRef } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Row, Col, Card, Spin, message, Form, InputNumber, Slider, Button, Space, Typography, Descriptions, List, Tag, Empty } from 'antd';
import AMapLoader from '@amap/amap-jsapi-loader';
import { simulateImpact, type SimulationResult } from '../../services/mockImpactSimulator';
import styles from './index.less';

declare global {
  interface Window {
    AMap: any; // 或者更具体的类型，如果知道的话
  }
}

const AMapKey = '35580e9f69fbee52787cecc400343936';
const AMapSecurityKey = '... 请替换为您的安全密钥 ...'; // 重要：请务必替换为您的JSAPI安全密钥，否则无法使用
// 您需要在高德开放平台申请 Web端 (JS API) Key，并将安全密钥 (jscode) 填在这里
// 申请地址: https://console.amap.com/dev/key/app

const { Text } = Typography;

// Helper function to get intensity label and color
const getIntensityStyle = (intensity: number): { label: string; color: string } => {
  // Reuse intensityLevels definition logic or access it if exported from simulator
  // Simplified version here:
  if (intensity >= 10) return { label: 'X+ 灾难及以上', color: '#a00000' };
  if (intensity >= 8) return { label: 'VIII-IX 严重破坏', color: '#ff4500' };
  if (intensity >= 6) return { label: 'VI-VII 破坏', color: '#ffa500' };
  if (intensity >= 4) return { label: 'IV-V 有感/惊醒', color: '#ffd700' };
  return { label: '< IV 无感', color: '#d9d9d9' };
};

const ImpactSimulationPage: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null); // 存储地图实例
  const [mapLoading, setMapLoading] = useState<boolean>(true);

  // --- 控制面板 State ---
  const [form] = Form.useForm(); // Form instance
  const [latitude, setLatitude] = useState<number | null>(39.90923); // 初始纬度 (北京)
  const [longitude, setLongitude] = useState<number | null>(116.397428); // 初始经度 (北京)
  const [magnitude, setMagnitude] = useState<number>(5.0); // 初始震级
  // --- 控制面板 State 结束 ---

  // --- Simulation State ---
  const [simulating, setSimulating] = useState<boolean>(false);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  // --- Simulation State 结束 ---

  // --- 地图覆盖物 Refs ---
  const epicenterMarkerRef = useRef<any>(null); // 存储震中标记 (红色)
  const intensityCirclesRef = useRef<any[]>([]); // 存储烈度圈实例
  const clickMarkerRef = useRef<any>(null); // 存储临时点击标记 (蓝色)
  // --- 地图覆盖物 Refs 结束 ---

  useEffect(() => {
    let isUnmounted = false; // 防止组件卸载后状态更新

    const initAMap = async () => {
      if (!mapContainerRef.current) {
        console.error("地图容器引用尚未准备好。");
        if (!isUnmounted) setMapLoading(false);
        message.error('地图容器加载失败');
        return;
      }

      try {
        // 配置安全密钥
        (window as any)._AMapSecurityConfig = {
          securityJsCode: AMapSecurityKey,
        };

        const AMap = await AMapLoader.load({
          key: AMapKey,
          version: "2.0", // 指定 JSAPI 版本号
          plugins: ['AMap.Scale', 'AMap.ToolBar', 'AMap.MapType'], // 根据需要加载插件
        });

        mapInstanceRef.current = new AMap.Map(mapContainerRef.current, {
          zoom: 5, // 初始缩放级别
          center: [116.397428, 39.90923], // 初始中心点 (北京)
          viewMode: '3D', // 使用 3D 视图
        });

        // 添加地图控件
        mapInstanceRef.current.addControl(new AMap.Scale());
        mapInstanceRef.current.addControl(new AMap.ToolBar());
        mapInstanceRef.current.addControl(new AMap.MapType());

        if (!isUnmounted) {
          setMapLoading(false);
          message.success('地图加载完成');
        }
        console.log('高德地图实例:', mapInstanceRef.current);

      } catch (e) {
        console.error("高德地图加载失败:", e);
        if (!isUnmounted) {
          setMapLoading(false);
          message.error('地图加载失败，请检查网络或API Key配置');
        }
      }
    };

    initAMap();

    // 清理函数：组件卸载时销毁地图
    return () => {
      isUnmounted = true;
      if (mapInstanceRef.current) {
        console.log('销毁地图实例');
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, []); // 空依赖数组确保只运行一次

  // --- 事件处理函数 ---
  const handleMapClick = (e: any) => {
    console.log("Map clicked! Event:", e);
    const lng = e.lnglat.getLng();
    const lat = e.lnglat.getLat();
    console.log(` Extracted Coords: Lat=${lat}, Lng=${lng}`);

    setLongitude(lng);
    setLatitude(lat);
    form.setFieldsValue({ longitude: lng, latitude: lat });
    message.info(`已选择震中: (${lat.toFixed(4)}, ${lng.toFixed(4)})`);

    // Add temporary blue marker on map click
    console.log("Checking map instance:", mapInstanceRef.current);
    console.log("Checking AMap availability:", window.AMap);
    if (mapInstanceRef.current && window.AMap) {
      const map = mapInstanceRef.current;
      const AMap = window.AMap;

      console.log("Attempting to remove previous click marker...");
      // Remove previous click marker if exists
      if (clickMarkerRef.current) {
        console.log(" Removing previous marker:", clickMarkerRef.current);
        map.remove(clickMarkerRef.current);
        clickMarkerRef.current = null;
      }

      console.log("Attempting to create new blue marker...");
      // Create and add new blue marker
      // {{ modifications }} - Use default style first for robustness
      clickMarkerRef.current = new AMap.Marker({
        position: [lng, lat],
        // Using default style, removing icon and offset for now
        title: '选择的震中位置'
      });
      console.log(" New marker created:", clickMarkerRef.current);

      try {
        console.log("Attempting to add marker to map...");
        map.add(clickMarkerRef.current);
        console.log(" Marker added successfully.");
      } catch (addError) {
        console.error("Failed to add click marker to map:", addError);
        message.error('在地图上添加标记失败');
      }
    }
  };

  const handleSimulate = async (values: any) => {
    // Remove temporary click marker when simulation starts
    if (clickMarkerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.remove(clickMarkerRef.current);
      clickMarkerRef.current = null;
    }

    console.log('开始模拟，参数:', values);
    setSimulating(true);
    setSimulationResult(null); // 清除旧结果
    message.loading({ content: '正在进行模拟计算...', key: 'simulate' });

    try {
      // 从 Form values 或 State 获取参数
      const params = {
        lat: values.latitude ?? latitude ?? 0,
        lng: values.longitude ?? longitude ?? 0,
      };
      const mag = values.magnitude ?? magnitude ?? 0;

      if (params.lat === null || params.lng === null || mag === null) {
        message.error({ content: '纬度、经度或震级不能为空', key: 'simulate', duration: 2 });
        setSimulating(false);
        return;
      }

      const result = await simulateImpact(params, mag);
      setSimulationResult(result);
      message.success({ content: `模拟完成！估算影响人口: ${result.estimatedAffectedPopulation.toLocaleString()}`, key: 'simulate', duration: 3 });
      // TODO: 在步骤 9 中根据 result 更新地图显示
      // TODO: 在步骤 10 中显示 result 摘要信息

    } catch (error) {
      console.error("模拟失败:", error);
      message.error({ content: '模拟计算失败，请稍后重试', key: 'simulate', duration: 2 });
    } finally {
      setSimulating(false);
    }
  };

  // 在地图加载完成后添加点击事件监听
  useEffect(() => {
    if (mapInstanceRef.current && !mapLoading) {
      mapInstanceRef.current.on('click', handleMapClick);
      console.log('地图点击事件监听已添加');

      // 清理旧的监听器
      return () => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.off('click', handleMapClick);
          console.log('地图点击事件监听已移除');
        }
      };
    }
    return undefined; // 无需清理
  }, [mapLoading]); // 依赖 mapLoading 状态

  // --- Effect to Update Map Overlays based on Simulation Result ---
  useEffect(() => {
    if (!mapInstanceRef.current || mapLoading || !window.AMap) {
      return; // 地图未准备好
    }

    const map = mapInstanceRef.current;
    const AMap = window.AMap;

    // 清除旧的覆盖物
    if (epicenterMarkerRef.current) {
      map.remove(epicenterMarkerRef.current);
      epicenterMarkerRef.current = null;
    }
    if (intensityCirclesRef.current.length > 0) {
      map.remove(intensityCirclesRef.current);
      intensityCirclesRef.current = [];
    }
    // Also remove temporary click marker when updating simulation results
    if (clickMarkerRef.current) {
      map.remove(clickMarkerRef.current);
      clickMarkerRef.current = null;
    }

    if (simulationResult) {
      // ** Add check for valid coordinates **
      if (isNaN(simulationResult.epicenter.lat) || isNaN(simulationResult.epicenter.lng)) {
        console.error('模拟结果包含无效的震中坐标:', simulationResult.epicenter);
        message.error('无法显示模拟结果：无效的地理坐标');
        return;
      }

      // 1. 添加震中标记
      epicenterMarkerRef.current = new AMap.Marker({
        position: [simulationResult.epicenter.lng, simulationResult.epicenter.lat],
        icon: '//a.amap.com/jsapi_demos/static/demo-center/icons/poi-marker-red.png', // 使用红色标记
        offset: new AMap.Pixel(-13, -30), // 调整图标偏移
        title: `震中 (M${simulationResult.magnitude.toFixed(1)})`
      });
      map.add(epicenterMarkerRef.current);

      // 2. 添加烈度圈 (按半径降序添加，大的在下面)
      intensityCirclesRef.current = [];
      simulationResult.intensityCircles.forEach(circleData => {
        // Add check for valid circle center as well (should be same as epicenter)
        if (isNaN(circleData.center.lat) || isNaN(circleData.center.lng)) {
          console.warn('跳过无效的烈度圈坐标:', circleData.center);
          return; // Skip this circle
        }
        // ** Add check for valid radius **
        if (isNaN(circleData.radius) || circleData.radius <= 0) {
          console.warn('跳过无效的烈度圈半径:', circleData.radius);
          return; // Skip this circle
        }

        const circle = new AMap.Circle({
          center: [circleData.center.lng, circleData.center.lat],
          radius: circleData.radius, // Validated radius
          strokeColor: circleData.color,
          strokeWeight: 2,
          strokeOpacity: 0.8,
          fillColor: circleData.color,
          fillOpacity: 0.2,
          // bubble: true, // 允许事件冒泡，可以添加点击事件等
          // extData: { intensity: circleData.intensity } // 附加数据
        });
        intensityCirclesRef.current.push(circle);
      });

      // Add circles only if the array is not empty after potential skips
      if (intensityCirclesRef.current.length > 0) {
         map.add(intensityCirclesRef.current);
      }

      // 3. 调整地图视野以包含所有烈度圈 (FitBounds)
      if (intensityCirclesRef.current.length > 0) {
        console.log("尝试 setFitView，覆盖物数量:", intensityCirclesRef.current.length); // Add log
        try {
          map.setFitView(
            intensityCirclesRef.current, // Use only circles for fitting view
            false,
            [150, 150, 150, 150]
          );
        } catch (fitViewError) {
          console.error("map.setFitView 失败:", fitViewError);
          message.error('调整地图视野失败，可能模拟范围过大');
          // Fallback: Zoom to epicenter if fitView fails
          map.setZoomAndCenter(6, [simulationResult.epicenter.lng, simulationResult.epicenter.lat]); 
        }
      }
    }

  }, [simulationResult, mapLoading]); // 依赖 simulationResult 和 mapLoading
  // --- Effect to Update Map Overlays 结束 ---

  return (
    <PageContainer>
      <Row gutter={16}>
        <Col span={6}>
          <Card title="模拟参数设置">
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSimulate}
              initialValues={{
                latitude: latitude,
                longitude: longitude,
                magnitude: magnitude,
              }}
            >
              <Form.Item label="震中位置" required>
                <Space.Compact block>
                  <Form.Item
                    name="latitude"
                    noStyle
                    rules={[{ required: true, message: '请输入纬度' }]}                  
                  >
                    <InputNumber
                      min={-90}
                      max={90}
                      step={0.001}
                      placeholder="纬度"
                      onChange={(value) => setLatitude(value)}
                      style={{ width: '50%' }}
                    />
                  </Form.Item>
                  <Form.Item
                    name="longitude"
                    noStyle
                    rules={[{ required: true, message: '请输入经度' }]}                 
                  >
                    <InputNumber
                      min={-180}
                      max={180}
                      step={0.001}
                      placeholder="经度"
                      onChange={(value) => setLongitude(value)}
                      style={{ width: '50%' }}
                    />
                  </Form.Item>
                </Space.Compact>
                <Text type="secondary" style={{ display: 'block', marginTop: '8px' }}>
                  或直接在右侧地图上点击选择
                </Text>
              </Form.Item>

              <Form.Item
                label={`震级 (M): ${magnitude.toFixed(1)}`}
                name="magnitude"
                rules={[{ required: true, message: '请选择震级' }]}
              >
                <Slider
                  min={3.0}
                  max={9.0}
                  step={0.1}
                  value={magnitude}
                  onChange={(value) => setMagnitude(value)}
                />
              </Form.Item>

              <Form.Item>
                <Button type="primary" htmlType="submit" block loading={simulating}>
                  开始模拟
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>
        <Col span={18}>
          <Card title="模拟结果地图">
            <Spin spinning={mapLoading} tip="地图加载中...">
              <div ref={mapContainerRef} style={{ height: '600px' }}>
                {/* 地图将在此渲染 */}
              </div>
            </Spin>
          </Card>
        </Col>
      </Row>
      <Row style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card title="模拟结果摘要">
            {simulating && <Spin tip="计算中..."><div style={{ height: '100px' }} /></Spin>}
            {!simulating && !simulationResult && (
              <Empty description='请在上方设置参数并点击"开始模拟"' />
            )}
            {!simulating && simulationResult && (
              <Descriptions bordered column={{ xxl: 4, xl: 3, lg: 3, md: 2, sm: 1, xs: 1 }}>
                <Descriptions.Item label="震源位置" span={2}>
                  {`纬度: ${simulationResult.epicenter.lat.toFixed(4)}, 经度: ${simulationResult.epicenter.lng.toFixed(4)}`}
                </Descriptions.Item>
                <Descriptions.Item label="设定震级">{`M ${simulationResult.magnitude.toFixed(1)}`}</Descriptions.Item>
                <Descriptions.Item label="估算影响人口 (烈度≥V)">
                  <Typography.Text strong style={{ color: '#f5222d' }}>
                    {`${simulationResult.estimatedAffectedPopulation.toLocaleString()} 人`}
                  </Typography.Text>
                </Descriptions.Item>

                <Descriptions.Item label="受影响主要城市" span={2}>
                  {simulationResult.affectedCities.length > 0 ? (
                    <List
                      size="small"
                      dataSource={simulationResult.affectedCities.slice(0, 5)} // 最多显示5个
                      renderItem={item => {
                        const style = getIntensityStyle(item.estimatedIntensity);
                        return (
                          <List.Item>
                            {item.name} <Tag color={style.color}>{`烈度 ${item.estimatedIntensity} (${style.label})`}</Tag>
                          </List.Item>
                        );
                      }}
                    />
                  ) : '无'}
                </Descriptions.Item>

                <Descriptions.Item label="受影响关键设施" span={2}>
                  {simulationResult.affectedFacilities.length > 0 ? (
                    <List
                      size="small"
                      dataSource={simulationResult.affectedFacilities}
                      renderItem={item => {
                        const style = getIntensityStyle(item.estimatedIntensity);
                        return (
                          <List.Item>
                            {`${item.name} (${item.type})`} <Tag color={style.color}>{`烈度 ${item.estimatedIntensity} (${style.label})`}</Tag>
                          </List.Item>
                        );
                      }}
                    />
                  ) : '无'}
                </Descriptions.Item>

              </Descriptions>
            )}
          </Card>
        </Col>
      </Row>
    </PageContainer>
  );
};

export default ImpactSimulationPage; 