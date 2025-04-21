import { PageContainer, ProCard } from '@ant-design/pro-components';
import { Card, Typography, Divider, Switch, Row, Col, message } from 'antd';
import React, { useState, useEffect } from 'react';

const { Title, Paragraph, Text, Link } = Typography;

const AdminSettingsResources: React.FC = () => {

  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(() => {
    const storedValue = localStorage.getItem('dashboardAutoRefresh');
    return storedValue === 'true';
  });

  useEffect(() => {
    localStorage.setItem('dashboardAutoRefresh', String(autoRefreshEnabled));
    message.info(`仪表盘自动刷新已 ${autoRefreshEnabled ? '启用' : '禁用'}`);
  }, [autoRefreshEnabled]);

  const handleAutoRefreshChange = (checked: boolean) => {
    setAutoRefreshEnabled(checked);
  };

  return (
    <PageContainer header={{ title: '设置与资源' }}>
      <Row gutter={[16, 16]}>
          <Col span={24}>
              <ProCard title="本地设置 (示例)" headerBordered bordered>
                  <Row align="middle" justify="space-between">
                      <Col>
                          <Text>启用仪表盘自动刷新</Text>
                          <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                              (每 5 分钟自动获取最新数据，需在仪表盘页面实现)
                          </Text>
                      </Col>
                      <Col>
                          <Switch
                              checked={autoRefreshEnabled}
                              onChange={handleAutoRefreshChange}
                              checkedChildren="开"
                              unCheckedChildren="关"
                          />
                      </Col>
                  </Row>
                  {/* 可以添加更多本地设置项 */}
              </ProCard>
          </Col>
          <Col xs={24} md={12}>
              <ProCard title="信息与资源" headerBordered bordered>
                  <Paragraph>
                      <Title level={5}>数据来源</Title>
                      <Link href="https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php" target="_blank">USGS GeoJSON Feeds</Link> - 本应用主要使用美国地质调查局提供的实时地震数据。
                  </Paragraph>
                  <Divider />
                  <Paragraph>
                      <Title level={5}>地震知识科普</Title>
                      <ul>
                          <li><Link href="https://www.usgs.gov/natural-hazards/earthquake-hazards/science/magnitude-intensity" target="_blank">震级 (Magnitude) vs 烈度 (Intensity)</Link></li>
                          <li><Link href="https://www.cea.gov.cn/cea/kpyd/zjkb/index.html" target="_blank">中国地震局 - 地震科普</Link></li>
                          {/* 可以添加更多科普链接 */}
                      </ul>
                  </Paragraph>
                  <Divider />
                  <Paragraph>
                      <Title level={5}>应急响应机构</Title>
                      <ul>
                          <li><Link href="http://www.cenc.ac.cn/" target="_blank">中国地震台网中心 (CENC)</Link></li>
                          <li><Link href="http://www.mem.gov.cn/" target="_blank">中华人民共和国应急管理部</Link></li>
                          <li><Link href="https://www.usgs.gov/programs/earthquake-hazards" target="_blank">USGS Earthquake Hazards Program</Link></li>
                          <li><Link href="https://www.fema.gov/" target="_blank">美国联邦紧急事务管理署 (FEMA)</Link></li>
                          {/* 可以添加其他国家/地区的机构 */}
                      </ul>
                  </Paragraph>
                  <Divider />
                  <Paragraph>
                      <Title level={5}>防震减灾指南</Title>
                      <ul>
                          <li><Link href="http://www.cenc.ac.cn/cenc/fzjz/index.html" target="_blank">中国地震台网中心 - 防震减灾</Link></li>
                          {/* 可以添加更多指南链接 */}
                      </ul>
                  </Paragraph>
              </ProCard>
          </Col>
          <Col xs={24} md={12}>
              <ProCard title="关于" headerBordered bordered>
                  <Paragraph>
                      <Title level={5}>地震信息聚合应用 (Demo)</Title>
                      <Text>
                          本应用旨在演示如何结合 Ant Design Pro 与高德地图 JS API 及 USGS 实时地震数据，
                          构建一个包含实时地图展示、数据筛选、统计概览及相关信息资源聚合的前端应用。
                      </Text>
                  </Paragraph>
                  <Divider />
                  <Paragraph>
                      <Title level={5}>主要技术栈</Title>
                      <ul>
                          <li>React</li>
                          <li>Ant Design / Ant Design Pro</li>
                          <li>UmiJS</li>
                          <li>高德地图 JS API</li>
                          <li>USGS Earthquake API</li>
                          <li>TypeScript</li>
                      </ul>
                  </Paragraph>
                  <Divider />
                  <Paragraph>
                      <Text type="secondary">版本: 1.0.0 (示例)</Text>
                  </Paragraph>
              </ProCard>
          </Col>
      </Row>
    </PageContainer>
  );
};

export default AdminSettingsResources;
