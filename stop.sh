#!/bin/bash
# =============================================================================
# PAROL6 停止脚本
# 停止所有 PM2 管理的 PAROL6 服务
# =============================================================================

cd /l2k/home/wzy/21-L2Karm/10-parol6-web-pliot

echo "=== PAROL6 停止脚本 ==="
echo ""

# 显示当前状态
echo "当前运行的服务:"
pm2 list 2>/dev/null || echo "  PM2 未运行"
echo ""

# 停止所有 PAROL6 服务
echo "正在停止服务..."
pm2 stop parol-nextjs parol-commander parol-api 2>/dev/null

# 显示停止后状态
echo ""
echo "=== 服务已停止 ==="
pm2 list 2>/dev/null

echo ""
echo "提示:"
echo "  - 重新启动: ./start.sh"
echo "  - 完全清除: pm2 kill"
echo "  - 串口现在可供其他程序使用"
