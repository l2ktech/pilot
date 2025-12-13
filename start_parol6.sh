#!/bin/bash
# 文件: start_parol6.sh
# 用途: 自动检查环境并启动PAROL6服务

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🤖 PAROL6 机械臂控制系统启动脚本"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔍 正在检查环境..."
echo ""

# 1. 检查Python环境
VENV_PATH="/l2k/home/wzy/21-L2Karm/envs/parol6_ws"
if [ ! -f "$VENV_PATH/bin/python3" ]; then
    echo "❌ Python虚拟环境未找到: $VENV_PATH"
    exit 1
fi
echo "✓ Python虚拟环境: $VENV_PATH"

# 2. 激活虚拟环境并检查依赖
source $VENV_PATH/bin/activate

$VENV_PATH/bin/python3 << 'EOF'
import sys
try:
    import fastapi, uvicorn, numpy, cv2, serial, oclock
    print("✓ Python依赖检查通过")
except ImportError as e:
    print(f"❌ Python依赖缺失: {e}")
    print("   请运行: pip install -r requirements.txt")
    sys.exit(1)
EOF

if [ $? -ne 0 ]; then
    exit 1
fi

# 3. 检查Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js未安装"
    echo "   请安装: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    exit 1
fi
NODE_VERSION=$(node --version)
echo "✓ Node.js: $NODE_VERSION"

# 4. 检查npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm未安装"
    exit 1
fi
NPM_VERSION=$(npm --version)
echo "✓ npm: $NPM_VERSION"

# 5. 检查PM2
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2未安装"
    echo "   请安装: sudo npm install -g pm2"
    exit 1
fi
PM2_VERSION=$(pm2 --version)
echo "✓ PM2: $PM2_VERSION"

# 6. 检查串口权限
if ! groups | grep -q dialout; then
    echo "⚠️  警告: 用户不在dialout组"
    echo "   运行: sudo usermod -a -G dialout $USER"
    echo "   然后注销并重新登录"
fi

# 7. 检查前端依赖
PROJECT_DIR="/l2k/home/wzy/21-L2Karm/10-parol6-web-pliot"
if [ ! -d "$PROJECT_DIR/frontend/node_modules" ]; then
    echo "⚠️  前端依赖未安装，正在安装..."
    cd $PROJECT_DIR/frontend
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ 前端依赖安装失败"
        exit 1
    fi
    echo "✓ 前端依赖安装完成"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔌 检查端口占用..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 8. 检查端口占用
check_port() {
    PORT=$1
    if sudo lsof -i :$PORT &> /dev/null; then
        echo "⚠️  端口 $PORT 已被占用"
        return 1
    else
        echo "✓ 端口 $PORT 可用"
        return 0
    fi
}

check_port 3000
check_port 3001
check_port 5001

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 启动PAROL6服务..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 9. 进入项目目录
cd $PROJECT_DIR

# 10. 启动服务
pm2 start ecosystem.config.js

# 11. 等待服务启动
echo ""
echo "⏳ 等待服务启动..."
sleep 5

# 12. 检查服务状态
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
pm2 list
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 13. 输出访问信息
echo ""
echo "✅ PAROL6服务已启动"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📱 访问地址:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   🌐 前端界面: http://localhost:3000"
echo "   📡 API文档:  http://localhost:3001/docs"
echo "   📊 API重定向: http://localhost:3001/redoc"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💡 常用命令:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   📋 查看状态: pm2 list"
echo "   📜 查看日志: pm2 logs"
echo "   🔄 重启服务: pm2 restart all"
echo "   🛑 停止服务: pm2 stop all"
echo "   🔍 实时监控: pm2 monit"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
