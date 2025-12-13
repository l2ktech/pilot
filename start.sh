#!/bin/bash
# PAROL6 Startup Script
# Kills any existing PM2 processes and starts fresh

cd /l2k/home/wzy/21-L2Karm/10-parol6-web-pliot

echo "=== PAROL6 Startup Script ==="
echo "Stopping any existing PM2 processes..."

# Kill all existing PM2 processes
pm2 kill 2>/dev/null

# Small delay to ensure processes are fully stopped
sleep 2

echo "Starting PM2 processes..."

# 自动检测 PAROL6 串口并更新配置
echo ""
echo "=== 检测 PAROL6 串口 ==="
if [ -x "./auto_detect_serial.sh" ]; then
    ./auto_detect_serial.sh
else
    echo "警告: auto_detect_serial.sh 不存在或不可执行"
fi
echo ""

# Start all services using ecosystem config
pm2 start ecosystem.config.js

# Wait for processes to initialize
sleep 3

# Show status
echo ""
echo "=== PM2 Status ==="
pm2 list

echo ""
echo "=== Startup Complete ==="
echo "Frontend: http://localhost:3000"
echo "API:      http://localhost:3001"
echo "API Docs: http://localhost:3001/redoc"
echo ""
echo "View logs: pm2 logs"
