#!/bin/bash
# 激活conda环境并启动Flask后端
echo "激活 earthquake_backend 环境..."
source ~/miniconda3/bin/activate earthquake_backend

echo "启动Flask后端服务..."
cd backend
python app.py 