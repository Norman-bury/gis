import React from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Card } from 'antd';

const AlertConfiguration: React.FC = () => {
  return (
    <PageContainer header={{ title: '告警配置' }}>
      <Card>
        <p>这里是告警配置页面。</p>
        {/* 后续将添加告警规则列表、创建、编辑等功能 */}
      </Card>
    </PageContainer>
  );
};

export default AlertConfiguration; 