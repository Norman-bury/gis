import React from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Card } from 'antd';

const UserManagement: React.FC = () => {
  return (
    <PageContainer header={{ title: '用户管理' }}>
      <Card>
        <p>这里是用户管理页面。</p>
        {/* 后续将添加用户列表、搜索、新增等功能 */}
      </Card>
    </PageContainer>
  );
};

export default UserManagement; 